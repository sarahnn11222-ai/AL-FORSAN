const crypto = require("crypto");

exports.handler = async function () {

  const clientId = process.env.DISCORD_CLIENT_ID;

  if (!clientId) {

    return {

      statusCode: 500,

      body: "Discord Client ID is not configured."

    };

  }

  const redirectUri =

    process.env.URL + "/.netlify/functions/discord-callback";

  const state = crypto.randomBytes(24).toString("hex");

  const params = new URLSearchParams({

    client_id: clientId,

    redirect_uri: redirectUri,

    response_type: "code",

    scope: "identify",

    state: state

  });

  return {

    statusCode: 302,

    headers: {

      Location: "https://discord.com/oauth2/authorize?" + params.toString(),

      "Set-Cookie": "discord_state=" + state +

        "; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600"

    },

    body: ""

  };

};
