export async function sendBrevoEmail({
  to,
  subject,
  htmlContent,
  textContent
}) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_FROM_EMAIL;
  const senderName = process.env.BREVO_FROM_NAME || "AirMesh";

  if (!apiKey || !senderEmail) {
    throw new Error("Brevo environment variables are incomplete.");
  }

  const recipients = (Array.isArray(to) ? to : [to])
    .map(email => String(email || "").trim().toLowerCase())
    .filter(Boolean)
    .map(email => ({ email }));

  if (recipients.length === 0) {
    throw new Error("Brevo email requires at least one recipient.");
  }

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": apiKey,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      sender: {
        name: senderName,
        email: senderEmail
      },
      to: recipients,
      subject,
      htmlContent,
      ...(textContent ? { textContent } : {})
    })
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `Brevo API returned HTTP ${response.status}: ${responseText.slice(0, 1000)}`
    );
  }

  return responseText ? JSON.parse(responseText) : {};
}
