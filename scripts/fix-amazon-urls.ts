import { PrismaClient } from '@prisma/client';
import { fixImageUrl } from '../utils/urlValidator';

const prisma = new PrismaClient();

async function fixAmazonUrls() {
  try {
    console.log('🔍 Searching for Amazon image URLs...');
    
    // Find all contents with Amazon image URLs
    const contents = await prisma.content.findMany({
      where: {
        OR: [
          { imageUrl: { contains: 'ssl-images-amazon.com' } },
          { imageUrl: { contains: 'media-amazon.com' } }
        ]
      },
      select: {
        id: true,
        imageUrl: true,
        subject: true
      }
    });

    console.log(`Found ${contents.length} contents with Amazon URLs`);

    let fixedCount = 0;
    
    for (const content of contents) {
      if (!content.imageUrl) continue;
      
      console.log(`\nContent ID: ${content.id}`);
      console.log(`Subject: ${content.subject}`);
      console.log(`Current URL: ${content.imageUrl}`);
      
      // Check if URL already has an extension
      const imageExtensions = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i;
      if (!imageExtensions.test(content.imageUrl)) {
        const fixedUrl = fixImageUrl(content.imageUrl);
        
        if (fixedUrl && fixedUrl !== content.imageUrl) {
          console.log(`Fixed URL: ${fixedUrl}`);
          
          // Update the database
          await prisma.content.update({
            where: { id: content.id },
            data: { imageUrl: fixedUrl }
          });
          
          fixedCount++;
          console.log('✅ Updated in database');
        }
      } else {
        console.log('✓ URL already has extension');
      }
    }

    console.log(`\n✨ Fixed ${fixedCount} Amazon URLs`);
    
  } catch (error) {
    console.error('Error fixing Amazon URLs:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
fixAmazonUrls();