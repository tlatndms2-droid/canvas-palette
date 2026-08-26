# Architecture

Core data and persistence are independent of UI. Canvas access is isolated in `CanvasAdapter`: it reads/writes Canvas JSON, attempts guarded runtime selection access, and translates screen drops to Canvas document coordinates. Search, preview, workspace, group serialization, Side Palette, and floating Mini Palette stay separate so defects can be fixed module-by-module.
