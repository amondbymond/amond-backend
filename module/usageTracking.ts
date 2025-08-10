import { queryAsync } from './commonFunction';

interface UsageLimits {
  projectsRemaining: number;
  singleImagesRemaining: number;
  editsRemainingToday: number | null;
  canCreateProject: boolean;
  canCreateSingleImage: boolean;
  canEditContent: boolean;
}

interface MembershipLimits {
  monthly_grid_sets: number;
  single_image_limit: number;
  content_edit_limit: number;
  daily_edit_limit: number | null;
}

// Get user's current usage and limits
export async function getUserUsageLimits(userId: number): Promise<UsageLimits> {
  try {
    // Get user's membership tier
    const userResult = await queryAsync(
      'SELECT grade FROM user WHERE id = ?',
      [userId]
    );
    
    if (!userResult || userResult.length === 0) {
      throw new Error('User not found');
    }
    
    const userGrade = userResult[0].grade || 'basic';
    
    // Get membership limits
    const limitsResult = await queryAsync(
      'SELECT * FROM membership_tiers WHERE tier_name COLLATE utf8mb4_unicode_ci = ?',
      [userGrade]
    );
    
    if (!limitsResult || limitsResult.length === 0) {
      throw new Error('Membership tier not found');
    }
    
    const limits: MembershipLimits = limitsResult[0];
    
    // Get current usage counts
    const usageResult = await queryAsync(`
      SELECT 
        COUNT(CASE WHEN usage_type = 'project_creation' THEN 1 END) as projects_created,
        COUNT(CASE WHEN usage_type = 'single_image_creation' THEN 1 END) as single_images_created,
        COUNT(CASE WHEN usage_type = 'content_edit' AND usage_date = CURRENT_DATE THEN 1 END) as edits_today
      FROM usage_tracking
      WHERE fk_userId = ?
    `, [userId]);
    
    const usage = usageResult[0] || { projects_created: 0, single_images_created: 0, edits_today: 0 };
    
    // Calculate remaining
    const projectsRemaining = limits.monthly_grid_sets - usage.projects_created;
    const singleImagesRemaining = limits.single_image_limit - usage.single_images_created;
    const editsRemainingToday = limits.daily_edit_limit === null 
      ? null 
      : limits.daily_edit_limit - usage.edits_today;
    
    return {
      projectsRemaining: Math.max(0, projectsRemaining),
      singleImagesRemaining: Math.max(0, singleImagesRemaining),
      editsRemainingToday: editsRemainingToday === null ? null : Math.max(0, editsRemainingToday),
      canCreateProject: projectsRemaining > 0,
      canCreateSingleImage: singleImagesRemaining > 0,
      canEditContent: editsRemainingToday === null || editsRemainingToday > 0,
    };
  } catch (error) {
    console.error('Error getting usage limits:', error);
    throw error;
  }
}

// Track a usage event
export async function trackUsage(
  userId: number, 
  usageType: 'project_creation' | 'single_image_creation' | 'content_edit',
  projectId?: number,
  contentId?: number,
  brandId?: number
): Promise<void> {
  try {
    await queryAsync(`
      INSERT INTO usage_tracking (fk_userId, usage_type, fk_projectId, fk_contentId, fk_brandId, usage_date)
      VALUES (?, ?, ?, ?, ?, CURRENT_DATE)
    `, [userId, usageType, projectId || null, contentId || null, brandId || null]);
  } catch (error) {
    console.error('Error tracking usage:', error);
    throw error;
  }
}

// Check if user can perform action
export async function canUserPerformAction(
  userId: number,
  action: 'create_project' | 'create_single_image' | 'edit_content'
): Promise<{ allowed: boolean; reason?: string; remaining?: number }> {
  try {
    const limits = await getUserUsageLimits(userId);
    
    switch (action) {
      case 'create_project':
        return {
          allowed: limits.canCreateProject,
          reason: limits.canCreateProject ? undefined : '프로젝트 생성 한도에 도달했습니다.',
          remaining: limits.projectsRemaining
        };
        
      case 'create_single_image':
        return {
          allowed: limits.canCreateSingleImage,
          reason: limits.canCreateSingleImage ? undefined : '개별 이미지 생성 한도에 도달했습니다.',
          remaining: limits.singleImagesRemaining
        };
        
      case 'edit_content':
        return {
          allowed: limits.canEditContent,
          reason: limits.canEditContent ? undefined : '오늘의 수정 한도에 도달했습니다.',
          remaining: limits.editsRemainingToday !== null ? limits.editsRemainingToday : undefined
        };
        
      default:
        return { allowed: false, reason: '알 수 없는 작업입니다.' };
    }
  } catch (error) {
    console.error('Error checking user permission:', error);
    return { allowed: false, reason: '권한 확인 중 오류가 발생했습니다.' };
  }
}

// Get detailed usage statistics
export async function getUserUsageStats(userId: number) {
  try {
    const stats = await queryAsync(`
      SELECT 
        u.id,
        u.name,
        u.email,
        u.grade,
        mt.tier_display_name,
        mt.monthly_price,
        -- Projects
        COUNT(DISTINCT CASE WHEN ut.usage_type = 'project_creation' THEN ut.id END) as projects_created,
        mt.monthly_grid_sets as project_limit,
        -- Single images
        COUNT(DISTINCT CASE WHEN ut.usage_type = 'single_image_creation' THEN ut.id END) as single_images_created,
        mt.single_image_limit,
        -- Edits today
        COUNT(DISTINCT CASE WHEN ut.usage_type = 'content_edit' AND ut.usage_date = CURRENT_DATE THEN ut.id END) as edits_today,
        mt.daily_edit_limit,
        -- Total edits
        COUNT(DISTINCT CASE WHEN ut.usage_type = 'content_edit' THEN ut.id END) as total_edits
      FROM user u
      LEFT JOIN membership_tiers mt ON u.grade COLLATE utf8mb4_unicode_ci = mt.tier_name COLLATE utf8mb4_unicode_ci
      LEFT JOIN usage_tracking ut ON u.id = ut.fk_userId
      WHERE u.id = ?
      GROUP BY u.id, u.name, u.email, u.grade, mt.tier_display_name, mt.monthly_price,
               mt.monthly_grid_sets, mt.single_image_limit, mt.daily_edit_limit
    `, [userId]);
    
    return stats[0] || null;
  } catch (error) {
    console.error('Error getting user usage stats:', error);
    throw error;
  }
}