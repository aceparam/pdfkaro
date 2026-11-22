Hand checks and page text added by `add-search-basics` (search basics: canonical and social tags, JSON-LD, hub pages, sitemap):

**VoiceOver list check (Safari, macOS and iOS)**
- [ ] On a hub page, such as `/organise-pages`, VoiceOver announces the tools as a list with its count ("list, 6 items").
- [ ] On a tool page, such as `/merge-pdf`, the related tools are announced as a list with its count.
- [ ] On a tool page, the link after the related tools reads as shown, such as "All tools in Organise pages, link".
- [ ] On the home page, each group's tools are still announced as a list with its count.

Every tool list now has `role="list"`, because its bullets are hidden and VoiceOver in Safari stops announcing a list without bullets as a list. Nothing changes on screen.

**Page text review (drafts for the owner)**
- [ ] The words of the six hub pages: each hub's title, description and one sentence, in `groups` in `src/tools/registry.ts`. They are listed in `openspec/changes/add-search-basics/design.md`, decision 4.
- [ ] The link words on every tool page: "All tools in Organise pages", "All tools in Make smaller and fix", "All tools in Convert to PDF", "All tools in Convert from PDF", "All tools in Edit and sign", "All tools in Protect". "All tools in Protect" and "All tools in Edit and sign" read a little awkwardly; the alternative is "More tools: Protect".
- [ ] The social image, `public/social.png`: "PDFkaro" and the tagline, dark text on the site's background. Its alt text is "PDFkaro. Every PDF job, done in your browser."

**Owner steps at launch (not agent steps)**
- [ ] Choose the domain and host; the launch build sets `SITE_ORIGIN` to that origin with `SITE_BASE=/`.
- [ ] Register in Google Search Console and Bing Webmaster Tools, and submit `https://<domain>/sitemap.xml`. Verify by a DNS record, an HTML file or a meta tag, never through Google Analytics or Google Tag Manager.
- [ ] Run two or three tool pages through Google's Rich Results Test and record the result. "Not eligible" for want of a rating is expected: ratings are banned.
- [ ] Check a link preview of the home page and one tool page in one or two apps.
