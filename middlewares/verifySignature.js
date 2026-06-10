/**
 * Node modules
 */
import crypto from "crypto";

// Environment variable for GitHub webhook secret
const GITHUB_SECRET = process.env.GITHUB_SECRET;

/**
 * Middleware to verify GitHub webhook signature
 */
export const verifySignature = (req, res, next) => {
  // Retrieve the signature from the headers
  const originalSignature = req.headers["x-hub-signature-256"];
  if (!originalSignature) return res.status(401).send("Invalid signature");

  // Generate the HMAC SHA256 signature using the request body and the secret
  const generatedSignature =
    "sha256=" +
    crypto
      .createHmac("sha256", GITHUB_SECRET)
      .update(JSON.stringify(req.body))
      .digest("hex");

  // Compare the generated signature with the original signature
  const buf1 = Buffer.from(generatedSignature);
  const buf2 = Buffer.from(originalSignature);

  if (buf1.length !== buf2.length) {
    return res.status(401).send("Invalid signature");
  }

  // Use timingSafeEqual to prevent timing attacks
  if (!crypto.timingSafeEqual(buf1, buf2)) {
    return res.status(401).send("Invalid Signature");
  }

  next();
};
