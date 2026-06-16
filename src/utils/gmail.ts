export interface GmailAttachment {
  fileName: string;
  fileType: string;
  base64Content: string; // Base64 chunk only, without raw header prefix (e.g. "data:image/jpeg;base64,")
}

/**
 * Encodes special characters into MIME header format (RFC 2047)
 */
const encodeHeader = (text: string): string => {
  return `=?UTF-8?B?${btoa(unescape(encodeURIComponent(text)))}?=`;
};

/**
 * Builds the RFC 2822 multipart mixed email message format and returns the URL-safe base64 string
 */
export const buildMimeEnvelope = (
  to: string,
  subject: string,
  bodyText: string,
  attachments: GmailAttachment[]
): string => {
  const boundary = "FotoAppBoundary_" + Math.random().toString(36).substring(2);
  
  // Headers section
  const headers = [
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ];

  const bodyParts: string[] = [];

  // Plain Text Body part
  bodyParts.push(
    `--${boundary}`,
    "Content-Type: text/plain; charset=\"UTF-8\"",
    "Content-Transfer-Encoding: base64",
    "",
    btoa(unescape(encodeURIComponent(bodyText))),
    ""
  );

  // Attachments
  for (const att of attachments) {
    bodyParts.push(
      `--${boundary}`,
      `Content-Type: ${att.fileType}; name="${att.fileName}"`,
      `Content-Disposition: attachment; filename="${att.fileName}"`,
      "Content-Transfer-Encoding: base64",
      "",
      att.base64Content,
      ""
    );
  }

  // End boundary
  bodyParts.push(`--${boundary}--`);

  const fullMessage = headers.concat(bodyParts).join("\r\n");

  // Base64URL safe encoding
  return btoa(unescape(encodeURIComponent(fullMessage)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

/**
 * Sends an email using the Gmail REST API
 */
export const sendGmailMessage = async (
  accessToken: string,
  to: string,
  subject: string,
  bodyText: string,
  attachments: GmailAttachment[]
): Promise<{ id: string; threadId: string }> => {
  const rawEnvelope = buildMimeEnvelope(to, subject, bodyText, attachments);

  const response = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        raw: rawEnvelope,
      }),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("Gmail sending failed:", errorBody);
    throw new Error(`Failed to send email: ${response.statusText} (${response.status})`);
  }

  return response.json();
};
