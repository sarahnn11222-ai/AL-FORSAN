const crypto = require("crypto");

exports.handler = async function (event) {

  const clientId = process.env.DISCORD_CLIENT_ID;

  const clientSecret = process.env.DISCORD_CLIENT_SECRET;

  const sessionSecret = process.env.SESSION_SECRET;

  const siteUrl = process.env.URL;

  if (!clientId || !clientSecret || !sessionSecret || !siteUrl) {

    return {

      statusCode: 500,

      body: "Server environment variables are missing."

    };

  }

  const params = event.queryStringParameters || {};

  const code = params.code;

  const returnedState = params.state;

  const cookieHeader = event.headers.cookie || "";

  const stateMatch = cookieHeader.match(/discord_state=([^;]+)/);

  const savedState = stateMatch ? stateMatch[1] : "";

  const clearStateCookie =

    "discord_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";

 if (!code || !returnedState || returnedState !== savedState) {

    return {

      statusCode: 400,

      headers: {

        "Set-Cookie": clearStateCookie

      },

      body: "Invalid Discord login state."

    };

  }

  const redirectUri =

    siteUrl + "/.netlify/functions/discord-callback";

  try {

    const tokenResponse = await fetch(

      "https://discord.com/api/oauth2/token",

      {

        method: "POST",

        headers: {

          "Content-Type": "application/x-www-form-urlencoded"

        },

        body: new URLSearchParams({

          client_id: clientId,

          client_secret: clientSecret,

          grant_type: "authorization_code",

          code: code,

          redirect_uri: redirectUri

        })

      }

    );

    if (!tokenResponse.ok) {

      throw new Error("Discord token exchange failed.");

    }

    const tokenData = await tokenResponse.json();

    const userResponse = await fetch(

      "https://discord.com/api/users/@me",

      {

        headers: {

          Authorization: "Bearer " + tokenData.access_token

        }

      }

    );

    if (!userResponse.ok) {

      throw new Error("Could not get Discord user.");

    }

    const user = await userResponse.json();

    const sessionData = {

      id: user.id,

      username: user.username,

      avatar: user.avatar,

      exp: Date.now() + 7 * 24 * 60 * 60 * 1000

    };

    const payload = Buffer.from(

      JSON.stringify(sessionData)

    ).toString("base64url");

    const signature = crypto

      .createHmac("sha256", sessionSecret)

      .update(payload)

      .digest("base64url");

    const sessionCookie =

      "forsan_session=" + payload + "." + signature +

      "; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800";

    return {

      statusCode: 302,

      headers: {

        Location: siteUrl,

        "Set-Cookie": [

          clearStateCookie,

          sessionCookie

        ]

      },

      body: ""

    };

  } catch (error) {

    return {

      statusCode: 500,

      headers: {

        "Set-Cookie": clearStateCookie

      },

      body: "Discord login failed. Please try again."

    };

  }

};