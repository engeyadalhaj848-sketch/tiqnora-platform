# TikTok App Review / Content Posting Audit Package — Tiqnora AI

Prepared: 2026-09-21

## Production configuration

- App name: Tiqnora AI
- Category: Productivity
- Website: https://www.tiqnora.com
- Terms: https://www.tiqnora.com/terms.html
- Privacy: https://www.tiqnora.com/privacy-policy.html
- Web redirect URI: https://www.tiqnora.com/api/social/oauth/tiktok
- Products: Login Kit, Content Posting API
- Content Posting API: Upload enabled, Direct Post enabled
- Scopes: user.info.basic, video.upload, video.publish
- Verified domain: tiqnora.com

## App review explanation (paste into TikTok App review)

Tiqnora AI is a multi-tenant web platform for businesses and creators to manage their own social content. TikTok Login Kit authenticates the user's TikTok account. user.info.basic is used only to display the authorized account identity. Content Posting API provides two user-initiated flows: video.upload sends the user's selected video to TikTok as a draft for further editing in TikTok; video.publish enables Direct Post after Tiqnora queries creator_info, shows the creator nickname, current privacy options, interaction controls, commercial-content disclosures, AI-content disclosure, a video preview, and explicit TikTok music/policy consent. The user manually selects privacy and post settings before each post. Tiqnora does not auto-publish, scrape, copy content from other platforms, or add watermarks. Tokens are stored encrypted server-side and refreshed securely.

## Demo video shot list

Record one end-to-end video, preferably 720p and under 50 MB.

1. Open https://www.tiqnora.com and briefly show the public website.
2. Scroll to the footer and show visible Privacy Policy and Terms of Service links.
3. Open Tiqnora Social Inbox.
4. Show the TikTok card and the connected account state.
5. If demonstrating authorization from scratch, click Connect/Reauthorize and show TikTok authorization, then approve the requested scopes.
6. Back in Tiqnora, show the authorized TikTok nickname/account.
7. Demonstrate Upload-to-TikTok:
   - choose an original MP4 file;
   - click Send as draft;
   - show successful upload in Tiqnora;
   - open TikTok and show the inbox notification/draft ready for editing.
8. Demonstrate Direct Post:
   - show the creator nickname loaded from creator_info;
   - show the video preview;
   - show that privacy has no preselected default;
   - manually choose one privacy option returned by TikTok (SELF_ONLY in unaudited sandbox testing);
   - show Comment, Duet, Stitch unchecked by default;
   - show the Commercial Content toggle off by default and the Your Brand / Branded Content disclosures when enabled;
   - show AI-content disclosure;
   - show the TikTok consent declaration immediately before the Publish button;
   - click Publish;
   - show successful status in Tiqnora and the resulting private TikTok post.
9. End by showing the Tiqnora page URL/domain in the browser.

## Recording guidance

- Use the actual Tiqnora website and the Sandbox target TikTok account.
- Keep the browser URL visible where practical.
- Do not blur the feature flow that reviewers need to verify.
- Do not expose Client Secret, Access Token, Refresh Token, service-role keys, or other credentials.
- Use original test media without third-party watermarks or logos added by Tiqnora.
- Maximum TikTok review upload: 5 demo videos, 50 MB each.

## Audit positioning / intended use

Tiqnora AI is intended as a multi-tenant SaaS for businesses and creators. Authorized users connect their own TikTok accounts and choose their own original media and post settings. The TikTok integration is not limited to uploading content for Tiqnora's own account or an internal team, and it is not designed to copy arbitrary content from other platforms.

## Final pre-submit checklist

- Production configuration mirrors the tested Sandbox configuration.
- All Production URL properties are verified in TikTok Developer Portal.
- App icon is clear and matches Tiqnora branding.
- Website is public and fully developed.
- Privacy Policy and Terms links are visible on the public website.
- Only required products/scopes are selected.
- Direct Post UI displays current creator nickname.
- creator_info is queried on the Direct Post page.
- Privacy choices come from TikTok and have no default selection.
- Comment / Duet / Stitch are off by default and disabled when creator settings prohibit them.
- Video duration is checked against max_video_post_duration_sec.
- Video preview is shown before publishing.
- Commercial Content controls and labels are shown.
- Branded Content cannot use SELF_ONLY privacy.
- Exact TikTok music/policy consent declaration is shown before publishing.
- No promotional watermark/logo is automatically added to user media.
- Draft upload informs the user that editing/posting continues from TikTok inbox.
- Demo video clearly covers Login Kit, user.info.basic, video.upload, video.publish.
