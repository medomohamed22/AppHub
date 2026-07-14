import { allowMethods, db, json } from './_lib.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;
  try {
    const supabase = db();
    await supabase.from('apps').update({is_featured:false}).eq('is_featured',true).lt('featured_until',new Date().toISOString());
    const { data, error } = await supabase
      .from('apps')
      .select('id,name,slug,category,network,short_description,website_url,icon_url,screenshot_urls,rating,ratings_count,views_count,get_clicks_count,is_verified,is_featured,featured_until,developer_name,created_at')
      .eq('status', 'published')
      .order('is_featured', { ascending: false })
      .order('featured_until', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return json(res, 200, { apps: data || [] });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: 'Unable to load apps' });
  }
}
