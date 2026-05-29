const { onSchedule } = require("firebase-functions/v2/scheduler");
const {
  onDocumentCreated,
  onDocumentDeleted,
} = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();
const db = admin.firestore();

const GMAIL_USER = defineSecret("GMAIL_USER");
const GMAIL_PASS = defineSecret("GMAIL_PASS");
const ADMIN_EMAIL = defineSecret("ADMIN_EMAIL");

// ── HELPER: check if email already sent this year ──
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
exports.checkBirthdaysDaily = onSchedule(
  {
    schedule: "every day 08:00",
    timeZone: "Africa/Lagos",
    secrets: ["GMAIL_USER", "GMAIL_PASS", "ADMIN_EMAIL"],
  },
  async () => {
    const gmailUser = GMAIL_USER.value();
    const gmailPass = GMAIL_PASS.value();
    const adminEmail = ADMIN_EMAIL.value();

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailPass },
    });

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

        if (bd === todayDay && bm === todayMon) {
          const sent = await alreadySentThisYear(
            member.id,
            currentYear,
            "birthday"
          );
          if (!sent) {
            await transporter.sendMail({
              from: `"RCCG Immanuel" <${gmailUser}>`,
              to: member.email,
              subject: "Happy Birthday from RCCG Immanuel!",
              html: `
                <h2>Happy Birthday, ${member.fullName}! 🎂</h2>
                <p>The entire RCCG Immanuel family celebrates you today.</p>
                <p>May this year bring you joy, health, and abundant blessings.</p>
                <p>With love,<br/>Parish Administration</p>
              `,
            });
            await writeLog(member.id, currentYear, "birthday");
            console.log(`Birthday email sent to ${member.fullName}`);
          }
        }

        if (bd === tomorrowDay && bm === tomorrowMon) {
          const alreadyNotified = await alreadySentThisYear(
            member.id,
            currentYear,
            "admin-tomorrow-notice"
          );
          if (!alreadyNotified) {
            await transporter.sendMail({
              from: `"RCCG Immanuel" <${gmailUser}>`,
              to: adminEmail,
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
      }
    }
  }
);

// ── FUNCTION 2: Welcome email on new member registration ──
exports.sendWelcomeEmail = onDocumentCreated(
  { document: "members/{memberId}", secrets: ["GMAIL_USER", "GMAIL_PASS"] },
  async (event) => {
    const member = event.data.data();
    if (!member.email) return null;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: GMAIL_USER.value(), pass: GMAIL_PASS.value() },
    });

    try {
      await transporter.sendMail({
        from: `"RCCG Immanuel" <${GMAIL_USER.value()}>`,
        to: member.email,
        subject: "Welcome to RCCG Immanuel!",
        html: `
          <h2>Welcome, ${member.fullName}! 🙏</h2>
          <p>You have been registered in the RCCG Immanuel Parish system.</p>
          <p>God bless you!</p>
          <p>Parish Administration</p>
        `,
      });
      console.log(`Welcome email sent to ${member.fullName}`);
    } catch (err) {
      console.error(
        `Failed sending welcome email to ${member.fullName}:`,
        err.message
      );
    }
    return null;
  }
);

// ── FUNCTION 3: Notify admin + clean up logs when member is deleted ──
exports.notifyAdminMemberDeleted = onDocumentDeleted(
  {
    document: "members/{memberId}",
    secrets: ["GMAIL_USER", "GMAIL_PASS", "ADMIN_EMAIL"],
  },
  async (event) => {
    const member = event.data.data();
    const memberId = event.params.memberId;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: GMAIL_USER.value(), pass: GMAIL_PASS.value() },
    });

    try {
      await transporter.sendMail({
        from: `"RCCG Immanuel" <${GMAIL_USER.value()}>`,
        to: ADMIN_EMAIL.value(),
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
  }
);
