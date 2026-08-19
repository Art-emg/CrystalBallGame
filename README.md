# Crystal Ball Game

Crystal Ball Game is a 3D silhouette puzzle inspired by the crystal marble mechanic. The repository keeps the original Unity project and the new browser version as independent projects.

## Projects

- [`unity-project/`](unity-project/) — the original Unity 6 project and assets.
- [`web/`](web/) — the production browser game built with React, TypeScript, Vite, and Three.js.

## Play

The current web version is published with GitHub Pages:

**https://art-emg.github.io/CrystalBallGame/**

## Web development

```bash
cd web
npm install
npm run dev
```

Create a production build with `npm run build`. Pushes to `main` automatically deploy `web/dist` to GitHub Pages.

## Unity

Open the [`unity-project`](unity-project/) folder in Unity `6000.0.36f1` or a compatible Unity 6 version. Generated folders such as `Library`, `Temp`, `Logs`, and `obj` are intentionally not committed.
