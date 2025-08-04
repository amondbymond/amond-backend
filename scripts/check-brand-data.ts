import dotenv from "dotenv";
dotenv.config();
import { queryAsync } from "../module/commonFunction";

async function checkBrandData() {
  try {
    // Check brands
    const brands = await queryAsync("SELECT * FROM brand LIMIT 10", []);
    console.log(`\nFound ${brands.length} brands:`);
    brands.forEach((brand: any) => {
      console.log(`- Brand ID ${brand.id}: ${brand.name} (${brand.category})`);
    });

    // Check projects with brand associations
    const projectsWithBrands = await queryAsync(
      "SELECT COUNT(*) as count FROM project WHERE fk_brandId IS NOT NULL", 
      []
    );
    console.log(`\nProjects with brand associations: ${projectsWithBrands[0].count}`);

    // Check projects without brand associations
    const projectsWithoutBrands = await queryAsync(
      "SELECT COUNT(*) as count FROM project WHERE fk_brandId IS NULL", 
      []
    );
    console.log(`Projects without brand associations: ${projectsWithoutBrands[0].count}`);

    // Show sample of projects with their brands
    const sampleProjects = await queryAsync(`
      SELECT p.id, p.name, p.sessionName, p.fk_brandId, b.name as brandName 
      FROM project p 
      LEFT JOIN brand b ON p.fk_brandId = b.id 
      LIMIT 10
    `, []);
    console.log(`\nSample projects with their brands:`);
    sampleProjects.forEach((project: any) => {
      console.log(`- Project ${project.id}: ${project.sessionName} -> Brand: ${project.brandName || 'NONE'} (ID: ${project.fk_brandId || 'NULL'})`);
    });

    process.exit(0);
  } catch (error) {
    console.error("Error checking brand data:", error);
    process.exit(1);
  }
}

checkBrandData();