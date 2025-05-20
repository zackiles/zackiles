# Releasing and Development

### Build Process

The files `index.html`, `index.gif`, and `graph.png` are generated automatically by the GitHub Actions workflow when changes are pushed to the main branch.

The workflow runs the following tasks:

- `deno task build:terminal` - Generates the terminal animation (HTML, SVG, and GIF)
- `deno task build:graph` - Generates the GitHub contribution graph

### Git LFS

This repository uses Git LFS (Large File Storage) to track binary files like PNGs and GIFs. To work with these files locally:

1. [Install Git LFS](https://git-lfs.com/) if you haven't already
2. Setup Git LFS in the repository:
   ```sh
   git lfs install
   git lfs pull
   ```

All PNG and GIF files are automatically tracked by Git LFS as specified in the `.gitattributes` file.
