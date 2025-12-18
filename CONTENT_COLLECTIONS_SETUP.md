# 🚀 Astro Content & Routing: The Full Flow

This guide summarizes how Astro handles Markdown content using Content Collections and explains the internal logic that ensures your CSS is applied correctly.

---

## 1. The Project Structure
For this flow to work, your files should be organized like this:
- `src/content/blog/` → Your Markdown files (e.g., `my-post.md`).
- `src/content/config.ts` → Defines the schema for your collection.
- `src/pages/blog/[slug].astro` → The dynamic route template.

---

## 2. Conceptual Internal Flow (Pseudo-Code)
When you run `npm run build`, Astro performs the following logic internally. This explains how the data moves from your folder to the final HTML.

```javascript
// --- WHAT ASTRO DOES BEHIND THE SCENES ---

// 1. DISCOVERY: Astro finds your collection
const collection = scanDirectory('./src/content/blog/'); 

// 2. ORCHESTRATION: Astro calls your getStaticPaths()
const paths = await getStaticPaths(); 
/* paths = [
     { params: { slug: 'hello' }, props: { entry: { data, body } } },
     ... 
   ] */

// 3. GENERATION LOOP: For every item in that list:
paths.forEach(page => {
    // A. Bind the specific entry to Astro.props
    const props = page.props;

    // B. Render Markdown into a Component
    // This step integrates the HTML into Astro's CSS scoping system
    const { Content } = await props.entry.render();

    // C. Wrap it in your Layout and write to disk
    const finalHTML = renderLayout(BaseLayout, { Content });
    fs.writeFileSync(`./dist/blog/${page.params.slug}/index.html`, finalHTML);
});