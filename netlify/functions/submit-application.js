
const crypto = require("crypto");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }

  try {
    // إعدادات الموقع والبوت
    const secret = process.env.SESSION_SECRET;
    const botToken = process.env.DISCORD_BOT_TOKEN;
    const channelId = process.env.DISCORD_APPLICATION_CHANNEL_ID;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (
      !secret ||
      !botToken ||
      !channelId ||
      !supabaseUrl ||
      !supabaseKey
    ) {
      throw new Error("Server configuration error");
    }

    // التحقق من تسجيل الدخول
    const cookies = event.headers.cookie || "";
    const match = cookies.match(/forsan_session=([^;]+)/);

    if (!match) {
      return {
        statusCode: 401,
        body: JSON.stringify({
          error: "يجب تسجيل الدخول بديسكورد أولاً"
        })
      };
    }

    const parts = match[1].split(".");

    if (parts.length !== 2) {
      throw new Error("Invalid session");
    }

    const payload = parts[0];
    const signature = parts[1];

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

    // استقبال الإجابات
    const data = JSON.parse(event.body || "{}");
    const answers = data.answers;

    if (
      !answers ||
      typeof answers !== "object" ||
      Array.isArray(answers)
    ) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "بيانات الطلب غير صحيحة"
        })
      };
    }

    const answerFields = Object.entries(answers).map(
      ([question, answer]) => ({
        name: String(question).slice(0, 256),
        value: String(answer || "لم تتم الإجابة").slice(0, 900),
        inline: false
      })
    );

    if (answerFields.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "لا توجد إجابات" })
      };
    }

    const username = user.username || "غير متوفر";
    const displayName = user.global_name || username;

    const avatarUrl = user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${user.avatar.startsWith("a_") ? "gif" : "png"}?size=128`
      : null;

    // حفظ الطلب في Supabase
    const saveResponse = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/rest/v1/applications`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          discord_id: user.id,
          discord_username: username,
          answers: answers,
          status: "pending"
        })
      }
    );

    if (!saveResponse.ok) {
      const errorText = await saveResponse.text();
      console.error("Supabase save error:", errorText);

      if (saveResponse.status === 409) {
        return {
          statusCode: 409,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            error: "لديك طلب تقديم قيد المراجعة بالفعل"
          })
        };
      }

      throw new Error("Could not save application");
    }

    const savedApplications = await saveResponse.json();
    const application = savedApplications[0];

    if (!application || !application.id) {
      throw new Error("Application ID was not returned");
    }

    // تجهيز بيانات المتقدم
    const accountFields = [
      {
        name: "اسم المستخدم في ديسكورد",
        value: `@${username}`.slice(0, 1024),
        inline: true
      },
      {
        name: "الاسم الظاهر",
        value: String(displayName).slice(0, 1024),
        inline: true
      },
      {
        name: "Discord ID",
        value: user.id,
        inline: false
      },
      {
        name: "رقم الطلب",
        value: String(application.id),
        inline: false
      },
      {
        name: "حالة الطلب",
        value: "قيد المراجعة",
        inline: false
      },
      {
        name: "رابط الحساب",
        value: `https://discord.com/users/${user.id}`,
        inline: false
      }
    ];

    // تقسيم الإجابات على عدة Embeds
    const embeds = [];

    for (let i = 0; i < answerFields.length; i += 4) {
      const isFirst = i === 0;

      embeds.push({
        title: "طلب تقديم جديد - AL-FORSAN",
        color: 0xC49A54,

        ...(isFirst
          ? {
              author: {
                name: `المتقدم: ${displayName}`,
                ...(avatarUrl ? { icon_url: avatarUrl } : {})
              },
              ...(avatarUrl
                ? { thumbnail: { url: avatarUrl } }
                : {}),
              fields: [
                ...accountFields,
                ...answerFields.slice(i, i + 4)
              ]
            }
          : {
              fields: answerFields.slice(i, i + 4)
            }),

        footer: {
          text: `طلب AL-FORSAN رقم ${application.id}`
        },

        timestamp: new Date().toISOString()
      });
    }

    // أزرار مراجعة الطلب
    const components = [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 3,
            label: "اجتياز الأسئلة",
            custom_id: `app:pass:${application.id}`
          },
          {
            type: 2,
            style: 4,
            label: "رفض الطلب",
            custom_id: `app:reject:${application.id}`
          }
        ]
      }
    ];

    // إرسال الطلب بواسطة البوت
    const discordResponse = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bot ${botToken}`
        },
        body: JSON.stringify({
          content: `طلب تقديم جديد من <@${user.id}>`,
          embeds,
          components
        })
      }
    );

    if (!discordResponse.ok) {
      const errorText = await discordResponse.text();
      console.error("Discord bot error:", errorText);

      // الطلب محفوظ في Supabase حتى لو تعذر إرسال إشعار الديسكورد
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ success: true })
    };

  } catch (error) {
    console.error("Application submission error:", error);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        error: "تعذر إرسال الطلب، حاول مرة أخرى"
      })
    };
  }
};