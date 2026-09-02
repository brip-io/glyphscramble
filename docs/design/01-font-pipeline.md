# 01 · Font pipeline

Status: beta implementation. Local, HTTPS, Google CSS, TTF, OTF, WOFF, and WOFF2 inputs normalize into locked SFNT artifacts. The custom table patcher handles cmap 4/12/14 and repairs checksums while preserving other table bytes. Remaining release gate: OTS and real multi-face fixture qualification.
