
const crypto = require("crypto");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }

  try {
    const secret = process.env.SESSION_SECRET;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const adminIds = (process.env.ADMIN_DISCORD_IDS || "")
      .split(",")
      .map(id => id.trim())
      .filter(Boolean);

    if (!secret || !supabaseUrl || !supabaseKey) {
      throw new Error("Server configuration error");
    }

    const cookies = event.headers.cookie || "";
    const match = cookies.match(/forsan_session=([^;]+)/);

    if (!match) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "يجب تسجيل الدخول أولاً" })
      };
    }

    const parts = match[1].split(".");
    if (parts.length !== 2) {
      throw new Error("Invalid session");
    }

    const [payload, signature] = parts;

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("base64url");

    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      throw new Error("Invalid signature");
    }

    const user = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    );

    if (!user.id || !user.exp || user.exp < Date.now()) {
      throw new Error("Session expired");
    }

    if (!adminIds.includes(String(user.id))) {
      return {
        statusCode: 403,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "ليس لديك صلاحية الإدارة" })
      };
    }

    const data = JSON.parse(event.body || "{}");
    const applicationId = Number(data.applicationId);
    const status = data.status;
    const interviewStatus = data.interviewStatus;

    if (!Number.isSafeInteger(applicationId) || applicationId < 1) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "رقم الطلب غير صحيح" })
      };
    }

    const validStatuses = ["pending", "accepted", "rejected"];
    const validInterviewStatuses = [
      "not_started",
      "pending",
      "accepted",
      "rejected"
    ];

    if (
      !validStatuses.includes(status) ||
      !validInterviewStatuses.includes(interviewStatus)
    ) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "حالة الطلب غير صحيحة" })
      };
    }

    if (status === "pending" && interviewStatus !== "not_started") {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "حالة المقابلة غير متوافقة" })
      };
    }

    if (
      status === "rejected" &&
      interviewStatus !== "not_started"
    ) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "حالة الطلب غير متوافقة" })
      };
    }

    if (
      status === "accepted" &&
      !["pending", "accepted", "rejected"].includes(interviewStatus)
    ) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "حالة المقابلة غير صحيحة" })
      };
    }

    const updateResponse = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/rest/v1/applications?id=eq.${applicationId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          status,
          interview_status: interviewStatus,
          updated_at: new Date().toISOString()
        })
      }
    );

    if (!updateResponse.ok) {
      console.error("Supabase update error:", await updateResponse.text());
      throw new Error("Could not update application");
    }

    const updated = await updateResponse.json();

    if (!updated.length) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "الطلب غير موجود" })
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        application: updated[0]
      })
    };

  } catch (error) {
    console.error("Update application error:", error);

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "تعذر تحديث الطلب" })
    };
  }
};