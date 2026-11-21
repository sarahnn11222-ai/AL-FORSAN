
const crypto = require("crypto");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }

  try {
    const secret = process.env.SESSION_SECRET;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

    const response = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/rest/v1/applications?discord_id=eq.${encodeURIComponent(user.id)}&select=id,answers,status,interview_status,created_at,updated_at&order=created_at.desc`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`
        }
      }
    );

    if (!response.ok) {
      console.error("Supabase read error:", await response.text());
      throw new Error("Could not load applications");
    }

    const applications = await response.json();

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ applications })
    };

  } catch (error) {
    console.error("My applications error:", error);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ error: "تعذر تحميل طلباتك" })
    };
  }
};