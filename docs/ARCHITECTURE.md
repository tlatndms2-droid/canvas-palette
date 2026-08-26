# Architecture

Core data and persistence are independent of UI. Canvas access must be isolated in a Canvas adapter because Obsidian Canvas runtime details are less stable than the public plugin API. Search, preview, workspace, and group serialization remain separable services so defects can be fixed module-by-module.
