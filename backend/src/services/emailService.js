const nodemailer = require('nodemailer');

/**
 * Email Service — Dual Delivery Engine (Ethereal Preview + Real SMTP)
 *
 * Mode 1: Ethereal (Default / Dev): Generates instant web preview URLs via disposable SMTP.
 * Mode 2: Real SMTP (Live Demo / Prod): Delivers physical emails to real inboxes.
 * Mode 3: Smart Routing: Routes demo accounts to Ethereal, and real addresses to SMTP if configured.
 */

let etherealTransporter = null;
let smtpTransporter = null;

/**
 * Check whether an address is a known demo or simulated test account
 */
const isTestEmail = (email) => {
  if (!email) return true;
  const lower = email.toLowerCase().trim();
  return (
    lower.endsWith('@example.com') ||
    lower.endsWith('@test.com') ||
    lower.startsWith('test') ||
    ['test1@gmail.com', 'test2@gmail.com', 'test3@gmail.com', 'test4@gmail.com', 'test5@gmail.com', 'test1@gamil.com', 'test2@gamil.com', 'test3@gamil.com', 'test4@gamil.com', 'test5@gamil.com'].includes(lower)
  );
};

/**
 * Get or initialize Ethereal test transporter
 */
const getEtherealTransporter = async () => {
  if (!etherealTransporter) {
    console.log('[EmailService] 🧪 Initializing disposable Ethereal test mail account...');
    const testAccount = await nodemailer.createTestAccount();
    etherealTransporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    console.log(`[EmailService] ✅ Ethereal initialized for user: ${testAccount.user}`);
  }
  return etherealTransporter;
};

/**
 * Get or initialize Real SMTP transporter
 */
const getSmtpTransporter = () => {
  if (!smtpTransporter) {
    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!user || !pass) {
      return null;
    }

    smtpTransporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }
  return smtpTransporter;
};

/**
 * Core sendEmail dispatcher
 */
const sendEmail = async ({ to, subject, html, text }) => {
  const configuredMode = (process.env.EMAIL_DELIVERY_MODE || 'smart').toLowerCase();
  const testRecipient = isTestEmail(to);
  const realSmtp = getSmtpTransporter();

  // Determine active transport
  let activeMode = 'ethereal';
  if (configuredMode === 'smtp' && realSmtp) {
    activeMode = 'smtp';
  } else if (configuredMode === 'smart') {
    activeMode = (!testRecipient && realSmtp) ? 'smtp' : 'ethereal';
  }

  let transporter;
  if (activeMode === 'smtp') {
    transporter = realSmtp;
  } else {
    transporter = await getEtherealTransporter();
  }

  const fromAddress = process.env.EMAIL_FROM || '"AuctionLoom Settlements" <settlements@auctionloom.com>';

  const mailOptions = {
    from: fromAddress,
    to,
    subject,
    text: text || html.replace(/<[^>]*>?/gm, ''),
    html,
  };

  const info = await transporter.sendMail(mailOptions);
  let previewUrl = null;

  if (activeMode === 'ethereal') {
    previewUrl = nodemailer.getTestMessageUrl(info);
    console.log(`[EmailService] 📨 Ethereal Preview URL generated for [${to}]:\n  👉 ${previewUrl}`);
  } else {
    console.log(`[EmailService] 🚀 Real email dispatched to [${to}] (ID: ${info.messageId})`);
  }

  return {
    messageId: info.messageId,
    previewUrl,
    mode: activeMode,
    deliveredTo: to,
  };
};

/**
 * Send Winner Notification & Invoice when an auction concludes
 */
const sendAuctionWonNotification = async ({ winnerEmail, winnerName, auction, seller, hammerPrice }) => {
  const formattedPrice = Number(hammerPrice || auction.current_price).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });

  const subject = `🏆 You Won Lot #${auction.id.slice(0, 8)}: ${auction.title} on AuctionLoom!`;

  const sellerPayout = seller?.payout_methods || {};
  const hasPayout = Object.keys(sellerPayout).length > 0;

  const payoutSection = hasPayout
    ? `
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-top: 16px;">
        <h4 style="margin: 0 0 8px 0; color: #0f172a; font-size: 14px; text-transform: uppercase;">Seller Verified Payout Coordinates</h4>
        ${sellerPayout.bank_name ? `<p style="margin: 4px 0; font-size: 14px;"><strong>Bank:</strong> ${sellerPayout.bank_name}</p>` : ''}
        ${sellerPayout.account_number ? `<p style="margin: 4px 0; font-size: 14px;"><strong>Account #:</strong> ${sellerPayout.account_number}</p>` : ''}
        ${sellerPayout.ifsc_or_swift ? `<p style="margin: 4px 0; font-size: 14px;"><strong>IFSC / SWIFT:</strong> ${sellerPayout.ifsc_or_swift}</p>` : ''}
        ${sellerPayout.upi_id ? `<p style="margin: 4px 0; font-size: 14px;"><strong>UPI ID:</strong> ${sellerPayout.upi_id}</p>` : ''}
        ${sellerPayout.paypal_email ? `<p style="margin: 4px 0; font-size: 14px;"><strong>PayPal:</strong> ${sellerPayout.paypal_email}</p>` : ''}
      </div>
    `
    : `
      <p style="font-size: 14px; color: #64748b; margin-top: 12px;">
        The seller has not registered automated digital coordinates yet. You may reply directly to this email or contact the seller at <strong>${seller.email}</strong> to coordinate payment and delivery.
      </p>
    `;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Winning Notice & Settlement Invoice</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; padding: 24px; margin: 0;">
        <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); padding: 32px; text-align: center; color: #ffffff;">
            <h1 style="margin: 0; font-size: 24px; letter-spacing: -0.5px;">⚡ AuctionLoom</h1>
            <p style="margin: 8px 0 0 0; color: #38bdf8; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Official Settlement Invoice</p>
          </div>

          <!-- Body -->
          <div style="padding: 32px;">
            <p style="font-size: 16px; color: #334155; margin-top: 0;">
              Congratulations <strong>${winnerName || 'Bidder'}</strong>,
            </p>
            <p style="font-size: 15px; color: #475569; line-height: 1.6;">
              You have placed the winning hammer bid on the following lot:
            </p>

            <!-- Lot Card -->
            <div style="background: #f8fafc; border-left: 4px solid #38bdf8; padding: 16px; border-radius: 4px; margin: 20px 0;">
              <h3 style="margin: 0 0 6px 0; color: #0f172a; font-size: 18px;">${auction.title}</h3>
              <p style="margin: 0; font-size: 13px; color: #64748b;">Lot ID: ${auction.id}</p>
              <div style="margin-top: 12px; display: flex; justify-content: space-between; align-items: baseline;">
                <span style="font-size: 14px; color: #64748b;">Winning Hammer Price:</span>
                <span style="font-size: 22px; font-weight: 700; color: #059669;">${formattedPrice}</span>
              </div>
            </div>

            <!-- Settlement Instructions -->
            <h3 style="font-size: 16px; color: #0f172a; margin-top: 24px;">Settlement & Payment Details</h3>
            <p style="font-size: 14px; color: #475569; line-height: 1.5; margin: 0;">
              Seller: <strong>${seller.name || 'Seller'}</strong> (${seller.email})
            </p>
            ${payoutSection}

            <!-- Action Button -->
            <div style="text-align: center; margin: 32px 0 16px 0;">
              <a href="https://auctionloom.vercel.app/auctions/${auction.id}" 
                 style="background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block;">
                View Auction & Coordinate in Live Room
              </a>
            </div>
          </div>

          <!-- Footer -->
          <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px; text-align: center; color: #94a3b8; font-size: 12px;">
            <p style="margin: 0;">AuctionLoom Distributed Bidding Engine • Automated Settlement Service</p>
            <p style="margin: 4px 0 0 0;">This is an automated transaction invoice generated upon auction conclusion.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: winnerEmail,
    subject,
    html,
  });
};

/**
 * Send Seller Notification when their lot is successfully sold
 */
const sendAuctionSoldNotification = async ({ sellerEmail, sellerName, auction, winner, hammerPrice }) => {
  const formattedPrice = Number(hammerPrice || auction.current_price).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });

  const commission = (Number(hammerPrice || auction.current_price) * 0.05).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });

  const subject = `🎉 Your Lot #${auction.id.slice(0, 8)} Sold for ${formattedPrice} on AuctionLoom!`;

  const html = `
    <!DOCTYPE html>
    <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; background-color: #f1f5f9; padding: 24px; margin: 0;">
        <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
          <div style="background: linear-gradient(135deg, #064e3b 0%, #0f172a 100%); padding: 32px; text-align: center; color: #ffffff;">
            <h1 style="margin: 0; font-size: 24px;">⚡ AuctionLoom</h1>
            <p style="margin: 8px 0 0 0; color: #34d399; font-size: 14px; font-weight: 600; text-transform: uppercase;">Lot Sold Notice</p>
          </div>
          <div style="padding: 32px;">
            <p style="font-size: 16px; color: #334155;">Hello <strong>${sellerName || 'Seller'}</strong>,</p>
            <p style="font-size: 15px; color: #475569; line-height: 1.6;">
              Great news! Bidding has concluded for <strong>${auction.title}</strong> and a winning bidder was declared.
            </p>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 4px 0; font-size: 14px;"><strong>Winning Hammer Price:</strong> <span style="color: #059669; font-weight: 700;">${formattedPrice}</span></p>
              <p style="margin: 4px 0; font-size: 14px;"><strong>Platform Fee (5%):</strong> ${commission}</p>
              <p style="margin: 4px 0; font-size: 14px;"><strong>Winning Bidder:</strong> ${winner.name || 'Bidder'} (${winner.email})</p>
            </div>
            <p style="font-size: 14px; color: #64748b;">
              Please coordinate directly with the winning bidder to verify payment settlement and ship the item.
            </p>
            <div style="text-align: center; margin: 32px 0 16px 0;">
              <a href="https://auctionloom.vercel.app/auctions/${auction.id}" 
                 style="background: #059669; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block;">
                Open Auction Room
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: sellerEmail,
    subject,
    html,
  });
};

module.exports = {
  sendEmail,
  sendAuctionWonNotification,
  sendAuctionSoldNotification,
  isTestEmail,
};
