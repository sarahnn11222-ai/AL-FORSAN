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

    const webhook = process.env.DISCORD_APPLICATION_WEBHOOK_URL;

    if (!secret || !webhook) {

      throw new Error("Server configuration error");

    }

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

    const data = JSON.parse(event.body || "{}");

    const answers = data.answers;

    if (

      !answers ||

      typeof answers !== "object" ||

      Array.isArray(answers)

    ) {

      return {

        statusCode: 400,

        body: JSON.stringify({ error: "بيانات الطلب غير صحيحة" })

      };

    }

    const fields = Object.entries(answers).map(([question, answer]) => ({

      name: String(question).slice(0, 256),

      value: String(answer || "لم تتم الإجابة").slice(0, 900),

      inline: false

    }));

    if (fields.length === 0) {

      return {

        statusCode: 400,

        body: JSON.stringify({ error: "لا توجد إجابات" })

      };

    }

    const embeds = [];

    for (let i = 0; i < fields.length; i += 6) {

      embeds.push({

        title: "طلب تقديم جديد - AL-FORSAN",

        color: 0xC49A54,

        fields: fields.slice(i, i + 6),

        footer: {
    text: "طلب جديد من موقع AL-FORSAN"
},

        timestamp: new Date().toISOString()

      });

    }

    const response = await fetch(webhook, {

      method: "POST",

      headers: {

        "Content-Type": "application/json"

      },

      body: JSON.stringify({ embeds })

    });

    if (!response.ok) {

      throw new Error("Discord webhook failed");

    }

    return {

      statusCode: 200,

      headers: {

        "Content-Type": "application/json"

      },

      body: JSON.stringify({ success: true })

    };

  } catch (error) {

    return {

      statusCode: 500,

      headers: {

        "Content-Type": "application/json"

      },

      body: JSON.stringify({

        error: "تعذر إرسال الطلب، حاولي مرة أخرى"

      })

    };

  }

};