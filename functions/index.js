const functions = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();
const db = admin.firestore();

const GMAIL_USER = functions.config().gmail.user;
const GMAIL_PASS = functions.config().gmail.pass;
const ADMIN_EMAIL = functions.config().admin.email;

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: GMAIL_USER, pass: GMAIL_PASS },
});

// ── HELPER: check if birthday email already sent this year ──
async function alreadySentThisYear(memberId, year, type = "birthday") {
  const snap = await db
    .collection("emailLogs")
    .where("memberId", "==", memberId)
    .where("year", "==", year)
    .where("type", "==", type)
    .get();
  return !snap.empty;
}

// ── HELPER: write log after sending ──
async function writeLog(memberId, year, type = "birthday") {
  await db.collection("emailLogs").add({
    memberId,
    year,
    sentAt: admin.firestore.FieldValue.serverTimestamp(),
    type,
  });
}

// ── FUNCTION 1: Daily birthday check at 8AM Lagos time ──
exports.checkBirthdaysDaily = functions.pubsub
  .schedule("every day 08:00")
  .timeZone("Africa/Lagos")
  .onRun(async () => {
    const now = new Date();
    const todayDay = now.getDate();
    const todayMon = now.getMonth() + 1;
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDay = tomorrow.getDate();
    const tomorrowMon = tomorrow.getMonth() + 1;
    const currentYear = now.getFullYear();

    const snapshot = await db.collection("members").get();

    for (const doc of snapshot.docs) {
      const member = { id: doc.id, ...doc.data() };

      try {
        if (!member.dob || !member.email) continue;

        const [, bm, bd] = member.dob.split("-").map(Number);

        // ── Birthday today → email the member ──
        if (bd === todayDay && bm === todayMon) {
          const sent = await alreadySentThisYear(
            member.id,
            currentYear,
            "birthday"
          );
          if (!sent) {
            await transporter.sendMail({
              from: `"RCCG Church" <${GMAIL_USER}>`,
              to: member.email,
              subject: "Happy Birthday from RCCG!",
              html: `
                <h2>Happy Birthday, ${member.fullName}! 🎂</h2>
                <p>The entire RCCG family celebrates you today.</p>
                <p>May this year bring you joy, health, and abundant blessings.</p>
                <p>With love,<br/>RCCG Church Administration</p>
              `,
            });
            await writeLog(member.id, currentYear, "birthday");
            console.log(`Birthday email sent to ${member.fullName}`);
          }
        }

        // ── Birthday tomorrow → notify admin (deduplicated per year) ──
        // BUG FIX fn#2: admin was notified every single day the cron ran for
        // the same "tomorrow" birthday because there was no deduplication log.
        // Now uses the same emailLogs pattern with type "admin-tomorrow-notice".
        if (bd === tomorrowDay && bm === tomorrowMon) {
          const alreadyNotified = await alreadySentThisYear(
            member.id,
            currentYear,
            "admin-tomorrow-notice"
          );
          if (!alreadyNotified) {
            await transporter.sendMail({
              from: `"RCCG Church" <${GMAIL_USER}>`,
              to: ADMIN_EMAIL,
              subject: `Birthday tomorrow: ${member.fullName}`,
              html: `
                <p><b>${member.fullName}</b> (${
                member.role
              }) has a birthday <b>tomorrow</b>.</p>
                <p>Email: ${member.email || "N/A"}</p>
              `,
            });
            await writeLog(member.id, currentYear, "admin-tomorrow-notice");
          }
        }
      } catch (err) {
        console.error(`Failed processing ${member.fullName}:`, err.message);
        // continues to next member
      }
    }

    return null;
  });

// ── FUNCTION 2: Welcome email when new member is registered ──
// BUG FIX fn#1: missing `return` after sendMail — the promise chain was not
// returned, causing Firebase to log unhandled promise termination warnings.
exports.sendWelcomeEmail = functions.firestore
  .document("members/{memberId}")
  .onCreate(async (snap) => {
    const member = snap.data();
    if (!member.email) return null;

    try {
      await transporter.sendMail({
        from: `"RCCG Church" <${GMAIL_USER}>`,
        to: member.email,
        subject: "Welcome to RCCG Member Docs!",
        html: `
          <h2>Welcome, ${member.fullName}! 🙏</h2>
          <p>You have been registered in the RCCG Church Documentation System.</p>
          <p>God bless you!</p>
          <p>RCCG Church Administration</p>
        `,
      });
      console.log(`Welcome email sent to ${member.fullName}`);
      return null; // BUG FIX fn#1: explicit return after await
    } catch (err) {
      console.error(
        `Failed sending welcome email to ${member.fullName}:`,
        err.message
      );
      return null;
    }
  });

// ── FUNCTION 3: Notify admin + clean up emailLogs when member is deleted ──
// BUG FIX fn#3: member.email could be undefined, rendering "undefined" in the
// email body. Now uses a null-safe fallback: member.email || "N/A".
exports.notifyAdminMemberDeleted = functions.firestore
  .document("members/{memberId}")
  .onDelete(async (snap, context) => {
    const member = snap.data();
    const memberId = context.params.memberId;

    try {
      await transporter.sendMail({
        from: `"RCCG Church" <${GMAIL_USER}>`,
        to: ADMIN_EMAIL,
        subject: `Member Deleted: ${member.fullName}`,
        html: `
          <p>The following member was removed from the system:</p>
          <p><b>Name:</b> ${member.fullName}</p>
          <p><b>Email:</b> ${member.email || "N/A"}</p>
          <p><b>Role:</b> ${member.role || "N/A"}</p>
        `,
      });
      console.log(`Admin notified of deletion: ${member.fullName}`);
    } catch (err) {
      console.error(`Failed sending deletion email:`, err.message);
    }

    try {
      const logs = await db
        .collection("emailLogs")
        .where("memberId", "==", memberId)
        .get();

      const batch = db.batch();
      logs.forEach((logDoc) => batch.delete(logDoc.ref));
      await batch.commit();
      console.log(`Cleaned up ${logs.size} emailLog(s) for ${member.fullName}`);
    } catch (err) {
      console.error(
        `Failed cleaning emailLogs for ${member.fullName}:`,
        err.message
      );
    }
  });
