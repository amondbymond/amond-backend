import express from "express";
const router = express.Router();
import {
  createHashId,
  decodeHashId,
  queryAsync,
} from "../module/commonFunction";
import { isLogin } from "../module/needAuth";
import moment from "moment-timezone";

// Get all brands for a user
router.get("/brands", isLogin, async function (req, res) {
  const userId = req.user?.id;

  try {
    const sql = `SELECT id, name, category, url, description, createdAt, updatedAt 
                 FROM brand 
                 WHERE fk_userId = ? 
                 ORDER BY updatedAt DESC`;
    const result = await queryAsync(sql, [userId]);
    
    const brands = result.map((brand: any) => ({
      brandId: createHashId(brand.id),
      name: brand.name,
      category: brand.category,
      url: brand.url,
      description: brand.description,
      createdAt: brand.createdAt,
      updatedAt: brand.updatedAt,
    }));

    res.status(200).json({ brands });
  } catch (e) {
    console.log(e);
    res.status(500).json({ message: "브랜드 목록 조회 실패" });
  }
});

// Create a new brand
router.post("/brand", isLogin, async function (req, res) {
  const userId = req.user?.id;
  const { name, category, url, description } = req.body;

  try {
    const sql = `INSERT INTO brand(name, category, url, description, fk_userId)
                 VALUES(?, ?, ?, ?, ?)`;
    const result = await queryAsync(sql, [name, category, url, description, userId]);

    const brandId = result.insertId;
    const hashId = createHashId(brandId);

    res.status(200).json({
      brandId: hashId,
    });
  } catch (e) {
    console.log(e);
    res.status(500).json({ message: "브랜드 생성 실패" });
  }
});

// Get feed sets for a specific brand
router.get("/:brandId/feedsets", isLogin, async function (req, res) {
  const userId = req.user?.id;
  const brandId = decodeHashId(req.params.brandId);

  try {
    const sql = `SELECT p.id, p.sessionName, p.imageList, p.reasonList, p.createdAt, p.lastAccessedAt, p.isActive 
                 FROM project p
                 JOIN brand b ON p.fk_brandId = b.id
                 WHERE b.id = ? AND b.fk_userId = ?
                 ORDER BY p.lastAccessedAt DESC, p.createdAt DESC`;
    const result = await queryAsync(sql, [brandId, userId]);
    
    const feedSets = result.map((project: any) => ({
      projectId: createHashId(project.id),
      sessionName: project.sessionName,
      imageList: project.imageList,
      reasonList: project.reasonList,
      createdAt: project.createdAt,
      lastAccessedAt: project.lastAccessedAt,
      isActive: project.isActive,
    }));

    res.status(200).json({ feedSets });
  } catch (e) {
    console.log(e);
    res.status(500).json({ message: "피드셋 목록 조회 실패" });
  }
});

// Create a new feed set for an existing brand
router.post("/:brandId/feedset", isLogin, async function (req, res) {
  const userId = req.user?.id;
  const brandId = decodeHashId(req.params.brandId);
  const { imageNameList, reasonList, autoGenerate, imageCount } = req.body;

  try {
    // Verify brand ownership
    const brandCheck = await queryAsync(
      "SELECT id, name, category, url, description FROM brand WHERE id = ? AND fk_userId = ?",
      [brandId, userId]
    );
    
    if (brandCheck.length === 0) {
      return res.status(403).json({ message: "브랜드 접근 권한이 없습니다." });
    }

    const brand = brandCheck[0];
    
    // Create presigned URLs for images
    const { uploadPresigned } = require("../module/aws");
    const presignedUrlList = [];
    const entireDirectoryList = [];
    
    if (autoGenerate) {
      // For auto-generation, create placeholder entries
      const placeholderCount = imageCount || 4;
      for (let i = 0; i < placeholderCount; i++) {
        // Generate placeholder filenames
        const fileName = `auto_generated_${Date.now()}_${i}.png`;
        const { url, entireDirectory } = await uploadPresigned({
          fileName,
          directory: "user/project",
        });
        presignedUrlList.push(url);
        entireDirectoryList.push(entireDirectory);
      }
    } else {
      // Normal image upload flow
      for (const imageName of imageNameList) {
        const { url, entireDirectory } = await uploadPresigned({
          fileName: imageName,
          directory: "user/project",
        });
        presignedUrlList.push(url);
        entireDirectoryList.push(entireDirectory);
      }
    }

    const sessionName = `${brand.name} - ${moment().format('YYYY-MM-DD HH:mm')}`;
    const sql = `INSERT INTO project(name, sessionName, category, url, imageList, reasonList, description, fk_userId, fk_brandId, createdAt, lastAccessedAt)
                 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`;
    const sqlValues = [
      brand.name,
      sessionName,
      brand.category,
      brand.url,
      entireDirectoryList.join(","),
      reasonList.join(","),
      brand.description,
      userId,
      brandId,
    ];
    const result = await queryAsync(sql, sqlValues);

    const projectId = result.insertId;
    const hashId = createHashId(projectId);
    
    // TODO: If autoGenerate is true, trigger AI image generation here
    // This would involve:
    // 1. Calling the AI API to generate images based on brand info
    // 2. Uploading generated images to S3
    // 3. Creating content request entries
    if (autoGenerate) {
      console.log(`[BRAND] Auto-generation requested for project ${projectId} with ${imageCount || 4} images`);
      // Image generation would happen here
    }

    res.status(200).json({
      projectId: hashId,
      presignedUrlList,
    });
  } catch (e: any) {
    console.error("Feed set creation error:", e);
    res.status(500).json({ message: "피드셋 생성 실패", error: e.message });
  }
});

// Update brand endpoint
router.put("/:brandId", isLogin, async function (req, res) {
  const userId = req.user?.id;
  const brandId = decodeHashId(req.params.brandId);
  const { name, category, url, description } = req.body;

  try {
    // Verify brand ownership
    const brandCheck = await queryAsync(
      "SELECT id FROM brand WHERE id = ? AND fk_userId = ?",
      [brandId, userId]
    );
    
    if (brandCheck.length === 0) {
      return res.status(403).json({ message: "브랜드 수정 권한이 없습니다." });
    }

    // Update brand
    const sql = `UPDATE brand 
                 SET name = ?, category = ?, url = ?, description = ?, updatedAt = NOW()
                 WHERE id = ? AND fk_userId = ?`;
    await queryAsync(sql, [name, category, url, description, brandId, userId]);

    res.status(200).json({ message: "브랜드 수정 성공" });
  } catch (e: any) {
    console.error("Brand update error:", e);
    res.status(500).json({ message: "브랜드 수정 실패", error: e.message });
  }
});

// Delete brand endpoint
router.delete("/:brandId", isLogin, async function (req, res) {
  const userId = req.user?.id;
  const brandId = decodeHashId(req.params.brandId);

  try {
    // Verify brand ownership
    const brandCheck = await queryAsync(
      "SELECT id FROM brand WHERE id = ? AND fk_userId = ?",
      [brandId, userId]
    );
    
    if (brandCheck.length === 0) {
      return res.status(403).json({ message: "브랜드 삭제 권한이 없습니다." });
    }

    // Get all projects for this brand
    const projects = await queryAsync(
      "SELECT id FROM project WHERE fk_brandId = ?",
      [brandId]
    );

    // Delete all related data for each project
    for (const project of projects) {
      // Delete notifications (if table exists)
      try {
        await queryAsync("DELETE FROM notification WHERE fk_projectId = ?", [project.id]);
      } catch (e: any) {
        if (e.code !== 'ER_NO_SUCH_TABLE') {
          throw e;
        }
      }
      
      // Delete requests (if table exists)
      try {
        await queryAsync("DELETE FROM request WHERE fk_projectId = ?", [project.id]);
      } catch (e: any) {
        if (e.code !== 'ER_NO_SUCH_TABLE') {
          throw e;
        }
      }
      
      // Delete content first (references contentrequest)
      try {
        const contentRequests = await queryAsync(
          "SELECT id FROM contentRequest WHERE fk_projectId = ?",
          [project.id]
        );
        
        for (const cr of contentRequests) {
          await queryAsync("DELETE FROM content WHERE fk_contentRequestId = ?", [cr.id]);
        }
      } catch (e: any) {
        if (e.code !== 'ER_NO_SUCH_TABLE') {
          console.error('Error deleting content:', e);
        }
      }
      
      // Delete contentrequest (if table exists)
      try {
        await queryAsync("DELETE FROM contentRequest WHERE fk_projectId = ?", [project.id]);
      } catch (e: any) {
        if (e.code !== 'ER_NO_SUCH_TABLE') {
          throw e;
        }
      }
      
      // Delete project
      await queryAsync("DELETE FROM project WHERE id = ?", [project.id]);
    }

    // Delete the brand
    await queryAsync("DELETE FROM brand WHERE id = ?", [brandId]);

    res.status(200).json({ message: "브랜드가 성공적으로 삭제되었습니다." });
  } catch (e) {
    console.error("Brand deletion error:", e);
    res.status(500).json({ message: "브랜드 삭제 실패" });
  }
});

export default router;