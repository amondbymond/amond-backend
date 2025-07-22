import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function findAndFixIncompleteUrls() {
  try {
    console.log('🔍 Searching for incomplete image URLs...');
    
    // Find all content with potential incomplete URLs
    const problematicContent = await prisma.content.findMany({
      where: {
        OR: [
          { imageUrl: { contains: 'f_auto/dpr_1.0' } },
          { imageUrl: { endsWith: '.com/' } },
          { imageUrl: { contains: '/a/images/f_auto' } },
          { imageUrl: { contains: 'static.nike.com' } }
        ]
      },
      select: {
        id: true,
        title: true,
        imageUrl: true,
        createdAt: true
      }
    });

    console.log(`Found ${problematicContent.length} content items with potentially incomplete URLs`);

    // Log each problematic URL
    for (const content of problematicContent) {
      console.log('\n---');
      console.log(`ID: ${content.id}`);
      console.log(`Title: ${content.title}`);
      console.log(`Image URL: ${content.imageUrl}`);
      console.log(`Created: ${content.createdAt}`);
      
      // Check if URL is definitely incomplete
      if (content.imageUrl && (
        content.imageUrl.endsWith('/') ||
        content.imageUrl.endsWith('f_auto/dpr_1.0') ||
        !content.imageUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i)
      )) {
        console.log('⚠️  URL appears to be incomplete!');
        
        // Option 1: Set to null (will trigger re-generation if your app supports it)
        // await prisma.content.update({
        //   where: { id: content.id },
        //   data: { imageUrl: null }
        // });
        
        // Option 2: Mark with a placeholder
        // await prisma.content.update({
        //   where: { id: content.id },
        //   data: { imageUrl: 'NEEDS_REGENERATION' }
        // });
      }
    }

    // Also check for any other suspicious patterns
    console.log('\n🔍 Checking for other suspicious URL patterns...');
    
    const suspiciousPatterns = [
      { contains: 'undefined' },
      { contains: 'null' },
      { equals: '' },
      { startsWith: '/' },
      { NOT: { contains: '.' } }
    ];

    for (const pattern of suspiciousPatterns) {
      const count = await prisma.content.count({
        where: { imageUrl: pattern }
      });
      
      if (count > 0) {
        console.log(`Found ${count} items matching pattern:`, pattern);
      }
    }

    console.log('\n✅ Analysis complete!');
    
  } catch (error) {
    console.error('Error during URL analysis:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
findAndFixIncompleteUrls();