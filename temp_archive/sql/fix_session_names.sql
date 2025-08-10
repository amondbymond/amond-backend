-- Fix missing sessionName values in project table
-- Generate sessionName as "BrandName - YYYY-MM-DD HH:mm" based on project creation date

UPDATE project p
JOIN brand b ON p.fk_brandId = b.id
SET p.sessionName = CONCAT(b.name, ' - ', DATE_FORMAT(p.createdAt, '%Y-%m-%d %H:%i'))
WHERE p.sessionName IS NULL;