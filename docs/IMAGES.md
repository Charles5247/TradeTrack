# Marketing images

Marketing and sign-in photos are listed in [`src/content/images.ts`](../src/content/images.ts), including each image's alt text. Components render a brand-colour gradient when an image path is empty or omitted.

To replace a photo, update its `src` and `alt` in that file. To remove it, omit or clear the `src`; leave the alt text as a description of the image's intended content. Do not add image paths directly to page or component files.

The social-preview image is also optional. When its path is omitted, the homepage does not advertise a missing Open Graph or Twitter image.
