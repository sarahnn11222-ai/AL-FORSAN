
const crypto = require("crypto");

const HEADERS = {
  "Content-Type": "application/json"
};

function response(statusCode, body) {
  return {
    statusCode,
    headers: HEADERS,
    body: JSON.stringify(body)
  };
}

function discordResponse(type, data = {}) {
  return response(200, { type, data });
}

function verifyDiscordSignature(event, publicKey) {
  const headers = event.headers || {};
  const signature =
    headers["x-signature-ed25519"] ||
    headers["X-Signature-Ed25519"];

  const timestamp =
    headers["x-signature-timestamp"] ||
    headers["X-Signature-Timestamp"];

  if (!signature || !timestamp || !publicKey) {
    return false;
  }

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64")
    : Buffer.from(event.body || "", "utf8");

  try {
    const derPrefix = Buffer.from(
      "302a300506032b6570032100",
      "hex"
    );

    const rawPublicKey = Buffer.from(publicKey, "hex");

    if (rawPublicKey.length !== 32) {
      return false;
    }

    const key = crypto.createPublicKey({
      key: Buffer.concat([derPrefix, rawPublicKey]),
      format: "der",
      type: "spki"
    });

    return crypto.verify(
      null,
      Buffer.concat([
        Buffer.from(timestamp, "utf8"),
        rawBody
      ]),
      key,
      Buffer.from(signature, "hex")
    );
  } catch (error) {
    console.error("Signature verification error:", error);
    return false;
  }
}

function adminMessage() {
  return {
    content: "ليس لديك صلاحية استخدام أزرار الإدارة.",
    flags: 64
  };
}

function firstStageButtons(applicationId) {
  return [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 3,
          label: "اجتاز الأسئلة",
          custom_id: `app:pass:${applicationId}`
        },
        {
          type: 2,
          style: 4,
          label: "رفض الطلب",
          custom_id: `app:reject:${applicationId}`
        }
      ]
    }
  ];
}

function finalStageButtons(applicationId) {
  return [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 3,
          label: "قبول نهائي",
          custom_id: `app:final_accept:${applicationId}`
        },
        {
          type: 2,
          style: 4,
          label: "رفض نهائي",
          custom_id: `app:final_reject:${applicationId}`
        }
      ]
    }
  ];
}

function statusEmbed(embeds, statusText) {
  const updatedEmbeds = Array.isArray(embeds)
    ? JSON.parse(JSON.stringify(embeds))
    : [];

  if (updatedEmbeds.length === 0) {
    updatedEmbeds.push({
      title: "طلب تقديم - AL-FORSAN",
      color: 0xC49A54
    });
  }

  const firstEmbed = updatedEmbeds[0];

  firstEmbed.fields = Array.isArray(firstEmbed.fields)
    ? firstEmbed.fields.filter(
        field => field.name !== "حالة الطلب"
      )
    : [];

  firstEmbed.fields.push({
    name: "حالة الطلب",
    value: statusText,
    inline: false
  });

  return updatedEmbeds;
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return response(405, {
      error: "Method not allowed"
    });
  }

  try {
    const publicKey = process.env.DISCORD_PUBLIC_KEY;

    if (!verifyDiscordSignature(event, publicKey)) {
      return response(401, {
        error: "Invalid Discord signature"
      });
    }

    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : event.body || "";

    const interaction = JSON.parse(rawBody);

    // Discord PING verification
    if (interaction.type === 1) {
      return discordResponse(1);
    }

    // We only handle button interactions
    if (interaction.type !== 3) {
      return discordResponse(4, {
        content: "هذا التفاعل غير مدعوم.",
        flags: 64
      });
    }

    const customId = interaction.data?.custom_id || "";
    const match = customId.match(
      /^app:(pass|reject|final_accept|final_reject):(\d+)$/
    );

    if (!match) {
      return discordResponse(4, {
        content: "الزر غير معروف.",
        flags: 64
      });
    }

    const action = match[1];
    const applicationId = Number(match[2]);

    if (
      !Number.isSafeInteger(applicationId) ||
      applicationId < 1
    ) {
      return discordResponse(4, {
        content: "رقم الطلب غير صحيح.",
        flags: 64
      });
    }

    // Check the administrator's Discord account ID
    const adminIds = (process.env.ADMIN_DISCORD_IDS || "")
      .split(",")
      .map(id => id.trim())
      .filter(Boolean);

    const adminId =
      interaction.member?.user?.id ||
      interaction.user?.id;

    if (!adminId || !adminIds.includes(String(adminId))) {
      return discordResponse(4, adminMessage());
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase configuration is missing");
    }

    const baseUrl = supabaseUrl.replace(/\/$/, "");

    // Read the application and its current status
    const readResponse = await fetch(
      `${baseUrl}/rest/v1/applications?id=eq.${applicationId}&select=id,status,interview_status`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`
        }
      }
    );

    if (!readResponse.ok) {
      throw new Error("Could not read application");
    }

    const applications = await readResponse.json();
    const application = applications[0];

    if (!application) {
      return discordResponse(4, {
        content: "الطلب غير موجود في قاعدة البيانات.",
        flags: 64
      });
    }

    let newStatus;
    let newInterviewStatus;
    let statusText;
    let nextButtons;

    // First stage: application questions
    if (action === "pass") {
      if (
        application.status !== "pending" ||
        application.interview_status !== "not_started"
      ) {
        return discordResponse(4, {
          content: "تمت مراجعة هذا الطلب مسبقًا أو تغيرت حالته.",
          flags: 64
        });
      }

      newStatus = "pending";
      newInterviewStatus = "pending";
      statusText = "تم اجتياز الأسئلة - بانتظار المقابلة الصوتية";
      nextButtons = finalStageButtons(applicationId);
    }

    else if (action === "reject") {
      if (
        application.status !== "pending" ||
        application.interview_status !== "not_started"
      ) {
        return discordResponse(4, {
          content: "تمت مراجعة هذا الطلب مسبقًا أو تغيرت حالته.",
          flags: 64
        });
      }

      newStatus = "rejected";
      newInterviewStatus = "not_started";
      statusText = "مرفوض";
      nextButtons = [];
    }

    // Final stage: voice interview decision
    else if (action === "final_accept") {
      if (
        application.status !== "pending" ||
        application.interview_status !== "pending"
      ) {
        return discordResponse(4, {
          content: "هذا الطلب ليس بانتظار المقابلة الصوتية.",
          flags: 64
        });
      }

      newStatus = "accepted";
      newInterviewStatus = "accepted";
      statusText = "مقبول نهائيًا - عضو مفعل";
      nextButtons = [];
    }

    else if (action === "final_reject") {
      if (
        application.status !== "pending" ||
        application.interview_status !== "pending"
      ) {
        return discordResponse(4, {
          content: "هذا الطلب ليس بانتظار المقابلة الصوتية.",
          flags: 64
        });
      }

      newStatus = "rejected";
      newInterviewStatus = "rejected";
      statusText = "مرفوض بعد المقابلة";
      nextButtons = [];
    }

    // Update Supabase
    const updateResponse = await fetch(
      `${baseUrl}/rest/v1/applications?id=eq.${applicationId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          status: newStatus,
          interview_status: newInterviewStatus,
          updated_at: new Date().toISOString()
        })
      }
    );

    if (!updateResponse.ok) {
      console.error(
        "Supabase update error:",
        await updateResponse.text()
      );

      throw new Error("Could not update application");
    }

    const updatedApplications = await updateResponse.json();

    if (!updatedApplications.length) {
      throw new Error("Application update returned no record");
    }

    // Update the original Discord message
    const updatedEmbeds = statusEmbed(
      interaction.message?.embeds || [],
      statusText
    );

    const content =
      interaction.message?.content ||
      `طلب تقديم رقم ${applicationId}`;

    return discordResponse(7, {
      content,
      embeds: updatedEmbeds,
      components: nextButtons,
      allowed_mentions: {
        parse: []
      }
    });

  } catch (error) {
    console.error("Discord interactions error:", error);

    return discordResponse(4, {
      content: "تعذر تنفيذ العملية. حاول مرة أخرى.",
      flags: 64
    });
  }
};
