import { Request, Response } from 'express';
import puppeteer from 'puppeteer';
import axios from 'axios';
import { URL } from 'url';
import { spawn } from 'child_process';
import path from 'path';

// --- CONFIGURATION ---
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || 'PASTE_YOUR_YOUTUBE_API_KEY_HERE';

// --- HELPER FUNCTIONS ---

/**
 * Downloads an image from a URL and converts it to a Base64 string.
 */
const imageUrlToBase64 = async (url: string): Promise<string> => {
    try {
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 10000
        });
        const buffer = Buffer.from(response.data, 'binary');
        
        // Detect image format from buffer if content-type is not provided
        let contentType = response.headers['content-type'];
        console.log(`🎨 Image from ${url} - Original content-type: ${contentType}`);
        
        if (!contentType || contentType === 'application/octet-stream' || !contentType.startsWith('image/')) {
            // Check magic bytes to determine image format
            const header = buffer.slice(0, 4);
            if (header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF) {
                contentType = 'image/jpeg';
            } else if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47) {
                contentType = 'image/png';
            } else if (header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46) {
                contentType = 'image/gif';
            } else if (header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46) {
                // WebP format starts with RIFF
                const webpCheck = buffer.slice(8, 12);
                if (webpCheck.toString('ascii') === 'WEBP') {
                    contentType = 'image/webp';
                }
            } else {
                // Default to JPEG if we can't determine
                contentType = 'image/jpeg';
            }
        }
        
        return `data:${contentType};base64,${buffer.toString('base64')}`;
    } catch (error) {
        console.error(`Failed to convert image URL to Base64: ${url}`, error);
        return ''; 
    }
};

/**
 * Resolves a relative URL path into a full, absolute URL.
 */
const resolveUrl = (relativeUrl: string, baseUrl: string): string => {
    try {
        return new URL(relativeUrl, baseUrl).href;
    } catch (error) {
        if (relativeUrl.startsWith('http')) return relativeUrl;
        return '';
    }
};

// --- SCRAPING STRATEGIES ---

/**
 * Handles YouTube channel URLs using the YouTube Data API v3.
 */
const handleYouTube = async (url: string): Promise<string[]> => {
    console.log(`YOUTUBE HANDLER: Processing ${url}`);

    let channelId = '';
    let channelImage: string | null = null;

    const channelMatch = url.match(/channel\/([A-Za-z0-9_-]+)/);
    const userMatch = url.match(/user\/([A-Za-z0-9_-]+)/);
    const handleMatch = url.match(/youtube\.com\/@([A-Za-z0-9._-]+)/);

    if (channelMatch) {
        channelId = channelMatch[1];
    } 
    else if (userMatch) {
        const username = userMatch[1];
        const userLookupUrl = `https://www.googleapis.com/youtube/v3/channels?part=id,snippet&forUsername=${username}&key=${YOUTUBE_API_KEY}`;
        const lookupRes = await axios.get(userLookupUrl);
        if (!lookupRes.data.items || lookupRes.data.items.length === 0) {
            throw new Error(`No channel found for username: ${username}`);
        }
        channelId = lookupRes.data.items[0].id;
        channelImage = lookupRes.data.items[0].snippet?.thumbnails?.high?.url || null;
    } 
    else if (handleMatch) {
        const handle = handleMatch[1];
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${handle}&type=channel&key=${YOUTUBE_API_KEY}`;
        const searchRes = await axios.get(searchUrl);
        if (!searchRes.data.items || searchRes.data.items.length === 0) {
            throw new Error(`No channel found for handle: ${handle}`);
        }
        channelId = searchRes.data.items[0].snippet.channelId;
        channelImage = searchRes.data.items[0].snippet?.thumbnails?.high?.url || null;
    } 
    else {
        throw new Error('Could not extract YouTube Channel ID or username from URL.');
    }

    const videoApiUrl = `https://www.googleapis.com/youtube/v3/search?key=${YOUTUBE_API_KEY}&channelId=${channelId}&part=snippet,id&order=viewCount&maxResults=4&type=video`;
    const videoRes = await axios.get(videoApiUrl);
    const videos = videoRes.data.items;

    const videoThumbs = videos.map((video: any) => video.snippet.thumbnails.high.url);
    if (channelImage) {
        return [channelImage, ...videoThumbs];
    }
    return videoThumbs;
};

/**
 * Handles Instagram URLs using Python instaloader service
 */
const handleInstagram = async (url: string): Promise<string[]> => {
    console.log(`INSTAGRAM HANDLER: Processing ${url}`);
    
    // Extract username from URL
    const usernameMatch = url.match(/instagram\.com\/([a-zA-Z0-9_.]+)/);
    if (!usernameMatch) {
        throw new Error('Could not extract Instagram username from URL.');
    }
    const username = usernameMatch[1];
    
    console.log(`Calling Python Instagram service for: ${username}`);
    
    return new Promise((resolve, reject) => {
        // Path to your Python script - adjust this path as needed
        const pythonScriptPath = path.join(__dirname, 'instagram_service.py');
        
        // Spawn Python process
        const pythonProcess = spawn('python3', [pythonScriptPath, username, '5']);
        
        let output = '';
        let errorOutput = '';
        
        pythonProcess.stdout.on('data', (data) => {
            output += data.toString();
        });
        
        pythonProcess.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });
        
        pythonProcess.on('close', (code) => {
            if (code !== 0) {
                console.error(`Python script exited with code ${code}`);
                console.error(`Error output: ${errorOutput}`);
                reject(new Error(`Instagram scraping failed: ${errorOutput}`));
                return;
            }
            
            try {
                const result = JSON.parse(output);
                
                if (!result.success) {
                    reject(new Error(result.error));
                    return;
                }
                
                console.log(`Successfully scraped ${result.images.length} images from Instagram`);
                resolve(result.images);
                
            } catch (parseError) {
                console.error('Failed to parse Python output:', output);
                reject(new Error('Failed to parse Instagram scraping results'));
            }
        });
        
        pythonProcess.on('error', (error) => {
            console.error('Failed to start Python process:', error);
            reject(new Error('Failed to start Instagram scraping service'));
        });
    });
};

/**
 * Handles general websites using Puppeteer
 */
const handleGeneralWebsite = async (url: string): Promise<string[]> => {
    console.log(`PUPPETEER HANDLER: Starting scrape for ${url}`);
    const browser = await puppeteer.launch({ 
        headless: true, 
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--disable-extensions',
            '--disable-plugins',
            '--disable-images',
            '--disable-javascript',
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-default-apps'
        ],
        executablePath: process.env.CHROME_BIN || undefined
    });
    const page = await browser.newPage();
    
    try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        await new Promise(resolve => setTimeout(resolve, 10000));

        const imageUrls = new Set<string>();
        const logoAndBrandingImages = new Set<string>();

        // Get Open Graph image
        try {
            const ogImageUrl = await page.$eval('meta[property="og:image"]', el => (el as HTMLMetaElement).content);
            if (ogImageUrl) {
                const ogImage = resolveUrl(ogImageUrl, url);
                logoAndBrandingImages.add(ogImage);
            }
        } catch (e) { /* ignore if not found */ }

        // Get Favicon
        try {
            const favicon = await page.$eval('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]', el => (el as HTMLLinkElement).href);
            if (favicon) logoAndBrandingImages.add(resolveUrl(favicon, url));
        } catch (e) { /* ignore if not found */ }

        // Get Logo
        try {
            const logoSrc = await page.evaluate(() => {
                const logoSelectors = [
                    'img[id*="logo"], img[class*="logo"], img[alt*="logo"]',
                    'header img, nav img, .header img, .navbar img, .nav img',
                    '.logo img, #logo img',
                    'img[src*="logo"]'
                ];
                
                for (const selector of logoSelectors) {
                    const logoEl = document.querySelector(selector);
                    if (logoEl) {
                        return (logoEl as HTMLImageElement).src;
                    }
                }
                return null;
            });
            if (logoSrc) logoAndBrandingImages.add(resolveUrl(logoSrc, url));
        } catch (e) { /* ignore if not found */ }

        // Get content images using the same comprehensive approach as before
        const allFoundImages = await page.evaluate((baseUrl) => {
            const resolve = (relative: string, base: string) => {
                try { 
                    if (relative.startsWith('http://') || relative.startsWith('https://')) {
                        return relative;
                    }
                    if (relative.startsWith('//')) {
                        return 'https:' + relative;
                    }
                    return new URL(relative, base).href; 
                } catch (e) { 
                    return relative;
                }
            };

            interface ImageData {
                src: string;
                top: number;
                left: number;
                area: number;
                width: number;
                height: number;
                type: string;
            }

            const images: ImageData[] = [];
            const seenUrls = new Set<string>();

            document.querySelectorAll('*').forEach(function(el) {
                const sources: Array<{src: string; width: number; height: number; type: string}> = [];
                const rect = el.getBoundingClientRect();

                // IMG elements
                if (el.tagName === 'IMG') {
                    const imgEl = el as HTMLImageElement;
                    let src = imgEl.src || 
                               imgEl.getAttribute('data-src') || 
                               imgEl.getAttribute('data-lazy') || 
                               imgEl.getAttribute('data-original') ||
                               imgEl.getAttribute('data-srcset') ||
                               imgEl.getAttribute('srcset') || '';
                    
                    if (src) {
                        const cleanSrc = src.split(',')[0].split(' ')[0].trim();
                        if (cleanSrc) {
                            sources.push({ src: cleanSrc, width: rect.width, height: rect.height, type: 'img' });
                        }
                    }
                }

                // CSS Background images
                const style = window.getComputedStyle(el);
                const bgImage = style.backgroundImage;
                if (bgImage && bgImage !== 'none' && bgImage.includes('url(')) {
                    const matches = bgImage.match(/url\(["']?([^"']*)["']?\)/g);
                    if (matches) {
                        matches.forEach(match => {
                            const bgUrl = match.match(/url\(["']?([^"']*)["']?\)/);
                            if (bgUrl && bgUrl[1] && bgUrl[1].trim()) {
                                sources.push({ src: bgUrl[1].trim(), width: rect.width, height: rect.height, type: 'bg' });
                            }
                        });
                    }
                }

                sources.forEach(source => {
                    let { src, width, height, type } = source;
                    
                    src = src.trim();
                    
                    if (src && 
                        !seenUrls.has(src) && 
                        width > 30 && 
                        height > 30 && 
                        !src.includes('1x1') &&
                        !src.includes('pixel') &&
                        !src.includes('tracking') &&
                        src.length > 5) { 
                        
                        const resolvedSrc = resolve(src, baseUrl);
                        const finalSrc = resolvedSrc || src;
                        
                        if (finalSrc && finalSrc.trim()) {
                            images.push({
                                src: finalSrc.trim(),
                                top: rect.top,
                                left: rect.left,
                                area: width * height,
                                width: width,
                                height: height,
                                type: type
                            });
                            seenUrls.add(src);
                        }
                    }
                });
            });

            images.sort((a, b) => b.area - a.area);

            return images.map(img => ({
                src: img.src,
                area: img.area,
                type: img.type
            }));
        }, url);

        console.log(`Found ${allFoundImages.length} total images on the page`);

        const contentImages: string[] = [];
        const brandingImages: string[] = [];

        allFoundImages.forEach(img => {
            const srcLower = img.src.toLowerCase();
            
            if (srcLower.includes('logo') || 
                srcLower.includes('favicon') || 
                srcLower.includes('icon') ||
                img.area < 10000) {
                brandingImages.push(img.src);
            } else {
                contentImages.push(img.src);
            }
        });

        const topContentImages = contentImages.slice(0, 8);
        topContentImages.forEach(img => {
            if (img && img.trim() && img.length > 10 && img.startsWith('http')) {
                imageUrls.add(img);
            }
        });

        if (imageUrls.size < 3) {
            const largerBrandingImages = allFoundImages
                .filter(img => {
                    return img.area > 50000 && 
                           !img.src.toLowerCase().includes('logo') && 
                           img.src && img.src.trim() && img.src.length > 10 && img.src.startsWith('http');
                })
                .slice(0, 5)
                .map(img => img.src);
                
            largerBrandingImages.forEach(img => {
                imageUrls.add(img);
            });
        }

        const brandingImagesArray = Array.from(logoAndBrandingImages).filter(Boolean);
        const contentImagesArray = Array.from(imageUrls).filter(Boolean);
        
        const finalImages = [...brandingImagesArray, ...contentImagesArray].slice(0, 12);
        
        console.log(`Returning ${brandingImagesArray.length} branding + ${contentImagesArray.length} content = ${finalImages.length} total images for ${url}`);
        return finalImages;
        
    } finally {
        await browser.close();
    }
};

// --- MAIN CONTROLLER ---

/**
 * Main controller for the /content/scrape-images endpoint.
 */
export const scrapeImagesController = async (req: Request, res: Response) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required.' });
    }

    // Add this to your scrapeImagesController
console.log('Environment check:', {
    NODE_ENV: process.env.NODE_ENV,
    CHROME_BIN: process.env.CHROME_BIN,
    YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY ? 'Present' : 'Missing'
});

    try {
        let imageUrls: string[] = [];
        const lowercasedUrl = url.toLowerCase();

        

        // Route to appropriate handler
        if (lowercasedUrl.includes('youtube.com/channel') ||
            lowercasedUrl.includes('youtube.com/user') ||
            lowercasedUrl.includes('youtube.com/@')) {
            imageUrls = await handleYouTube(url);
        } else if (lowercasedUrl.includes('instagram.com')) {
            imageUrls = await handleInstagram(url);
        } else {
            imageUrls = await handleGeneralWebsite(url);
        }

        

        if (imageUrls.length === 0) {
            return res.status(404).json({ error: 'Could not find any suitable images on the provided URL.' });
        }

        // Check if we already have base64 images (from Instagram) or need to convert URLs
        const isBase64Images = imageUrls.length > 0 && imageUrls[0].startsWith('data:image/');
        
        let finalImages: string[];
        
        if (isBase64Images) {
            
            finalImages = imageUrls.filter(img => img.length > 0);
        } else {
            
            const base64Images = await Promise.all(
                imageUrls.map(imageUrlToBase64)
            );
            finalImages = base64Images.filter(b64 => b64.length > 0);
        }
        
        

        res.status(200).json({ images: finalImages });

    } catch (error) {
        console.error('Scraping failed with detailed error:', {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            url: url
        });
        
        let errorMessage = 'An error occurred during the scraping process.';
        if (error instanceof Error) {
            if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
                errorMessage = 'Unable to connect to the target website. Please check the URL and try again.';
            } else if (error.message.includes('timeout')) {
                errorMessage = 'Request timed out. The website may be slow or unavailable.';
            } else if (error.message.includes('puppeteer')) {
                errorMessage = 'Browser automation failed. This may be due to missing system dependencies.';
            } else if (error.message.includes('Instagram scraping failed')) {
                errorMessage = `Instagram scraping failed: ${error.message}`;
            }
        }
        
        res.status(500).json({ error: errorMessage });
    }
};