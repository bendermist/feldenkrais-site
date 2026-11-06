# Marius Kluonis · Feldenkrais Practitioner

A one-page site for individual Functional Integration® lessons.

- `index.html`: content and sections
- `css/style.css`: design (cream palette, Cormorant + Inter)
- `js/scenes.js`: Three.js scenes: spine rotation (hero), head and eyes lesson (ATM), a Functional Integration lesson on the table
- `models/`: the 3D models (loaded only when each section comes into view)
- `js/main.js`: menu, scroll reveals, contact form (opens an email draft)

## Run locally

```bash
node tools/serve.mjs 4330
```

Then open http://127.0.0.1:4330/

## Still to fill in

Everything marked in terracotta with a dashed underline (`class="fill"`) in `index.html`:

- Training, programme, year, guild membership (About)
- Your story, 2–3 sentences (About)
- Portrait photo (About)
- Fees (Ways to work together)
- Email, phone, studio address (Contact; the email is also used by the form)

The hero quote is by Moshe Feldenkrais.

## 3D models and licences

These are credited in the site footer; keep the credits if you change the models.

| File | Source | Licence |
| --- | --- | --- |
| `models/spine.glb` | BodyParts3D, © The Database Center for Life Science (24 vertebrae with discs, ribs, sternum and cartilages, pelvis, shoulder girdle, skull). Converted, simplified and compressed; each vertebra is a separate part pivoting at its vertebral body. | CC BY-SA 2.1 JP: the adapted file is shared under the same licence |
| `models/head.glb` | "Infinite" 3D head scan by Lee Perry-Smith (from the three.js examples) | CC BY 3.0 |
| `models/figure.glb` | X Bot by Mixamo (from the three.js examples) | Mixamo terms: free to use in projects |
