const crypto = require("crypto");

exports.handler = async function (event) {

  const secret = process.env.SESSION_SECRET;

  if (!secret) {

    return {

      statusCode: 500,

      body: JSON.stringify({ error: "Server configuration error" })

    };

  }

  const cookies = event.headers.cookie || "";

  const match = cookies.match(/forsan_session=([^;]+)/);

  if (!match) {

    return {

      statusCode: 200,

      headers: { "Content-Type": "application/json" },

      body: JSON.stringify({ loggedIn: false })

    };

  }

  try {

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

    return {

      statusCode: 200,

      headers: { "Content-Type": "application/json" },

      body: JSON.stringify({

        loggedIn: true,

        user: {

          id: user.id,

          username: user.username,

          avatar: user.avatar

        }

      })

    };

  } catch (error) {

    return {

      statusCode: 200,

      headers: { "Content-Type": "application/json" },

      body: JSON.stringify({ loggedIn: false })

    };

  }

};

