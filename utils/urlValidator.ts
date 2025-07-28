/**
 * Validates if a URL is complete and properly formatted
 */
export function isValidImageUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    const urlObj = new URL(url);
    
    // Check if URL has a valid protocol
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return false;
    }

    // Check if URL has a hostname
    if (!urlObj.hostname) {
      return false;
    }

    // Check if URL has a pathname (not just domain)
    if (urlObj.pathname === '/' || urlObj.pathname === '') {
      return false;
    }

    // Check for common incomplete patterns
    const incompletePatterns = [
      /\/f_auto\/dpr_[\d.]+$/,  // Ends with f_auto/dpr_X.X
      /\/f_auto$/,               // Ends with f_auto
      /\/images\/$/,             // Ends with images/
      /\/a\/images\/$/,          // Ends with a/images/
    ];

    for (const pattern of incompletePatterns) {
      if (pattern.test(urlObj.pathname)) {
        console.warn(`URL appears to be incomplete: ${url}`);
        return false;
      }
    }

    // Check if URL likely points to an image file
    const imageExtensions = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i;
    const hasImageExtension = imageExtensions.test(urlObj.pathname);
    
    // Allow URLs without extensions if they're from known CDNs that serve images
    const knownImageCDNs = [
      'cloudinary.com',
      'imgix.net',
      'images.unsplash.com',
      'amazonaws.com',
      'googleusercontent.com',
      'ssl-images-amazon.com',
      'media-amazon.com'
    ];
    
    const isFromKnownCDN = knownImageCDNs.some(cdn => urlObj.hostname.includes(cdn));
    
    if (!hasImageExtension && !isFromKnownCDN) {
      console.warn(`URL may not be an image: ${url}`);
      // You might want to return false here, depending on your needs
    }

    return true;
  } catch (error) {
    console.error(`Invalid URL format: ${url}`, error);
    return false;
  }
}

/**
 * Attempts to fix common URL issues
 */
export function fixImageUrl(url: string): string | null {
  if (!url || typeof url !== 'string') {
    return null;
  }

  // Remove any trailing slashes
  url = url.replace(/\/+$/, '');

  // If URL is just a fragment, return null
  if (url.startsWith('/') && !url.startsWith('//')) {
    return null;
  }

  // Add https:// if protocol is missing but looks like a domain
  if (!url.includes('://') && url.includes('.')) {
    url = 'https://' + url;
  }

  // Fix Amazon image URLs that are missing file extensions
  if (url.includes('ssl-images-amazon.com') || url.includes('media-amazon.com')) {
    // Check if URL already has an image extension
    const imageExtensions = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i;
    if (!imageExtensions.test(url)) {
      // Amazon images are typically JPEGs, add .jpg extension
      url = url + '.jpg';
      console.log(`Fixed Amazon image URL: ${url}`);
    }
  }

  // Validate the fixed URL
  if (isValidImageUrl(url)) {
    return url;
  }

  return null;
}