const https = require("https");
const { URL } = require("url");

// Runs twice a week (Mon + Thu) to prevent Supabase free-tier auto-pause (7-day threshold)
exports.handler = async () => {
  const { hostname } = new URL(process.env.SUPABASE_URL);

  await new Promise((resolve, reject) => {
    const req = https.request({
      hostname,
      path: "/rest/v1/spec_submissions?select=id&limit=1",
      method: "GET",
      headers: {
        "apikey": process.env.SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${process.env.SUPABASE_ANON_KEY}`
      }
    }, res => {
      res.on("data", () => {});
      res.on("end", () => {
        if (res.statusCode === 200) resolve();
        else reject(new Error(`Unexpected status: ${res.statusCode}`));
      });
    });
    req.on("error", reject);
    req.end();
  });

  console.log("Supabase keep-alive ping succeeded");
  return { statusCode: 200 };
};
