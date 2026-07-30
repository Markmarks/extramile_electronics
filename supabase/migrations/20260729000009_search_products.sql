-- Migration 009 — product search RPC (docs/06-BUILD-PROMPTS.md P4)
-- Full-text search (search_tsv) with a pg_trgm similarity fallback for typos
-- ("iphon 15"). Facet filters applied against active variants. Returns setof products.
-- Rollback: drop function search_products.

create function public.search_products(
  q text default '',
  p_category uuid default null,
  p_brand uuid default null,
  p_condition product_cond default null,
  p_in_stock boolean default false,
  p_min_price bigint default null,
  p_max_price bigint default null,
  p_sort text default 'relevance',
  p_limit int default 24,
  p_offset int default 0
) returns setof products
language sql stable set search_path = public as $$
  select p.*
  from products p
  where p.is_active
    and (p_category is null or p.category_id = p_category)
    and (p_brand is null or p.brand_id = p_brand)
    and (p_condition is null or p.condition = p_condition)
    and (
      coalesce(q, '') = ''
      or p.search_tsv @@ websearch_to_tsquery('english', q)
      or p.title % q          -- trigram similarity (typo tolerance)
      or coalesce(p.model, '') % q
    )
    and exists (
      select 1 from product_variants v
      where v.product_id = p.id and v.is_active
        and (not p_in_stock or (v.stock - v.reserved) > 0)
        and (p_min_price is null or v.price >= p_min_price)
        and (p_max_price is null or v.price <= p_max_price)
    )
  order by
    case when p_sort = 'relevance' and coalesce(q, '') <> ''
         then ts_rank(p.search_tsv, websearch_to_tsquery('english', q)) end desc nulls last,
    case when p_sort = 'price_asc'
         then (select min(v.price) from product_variants v where v.product_id = p.id and v.is_active) end asc nulls last,
    case when p_sort = 'price_desc'
         then (select min(v.price) from product_variants v where v.product_id = p.id and v.is_active) end desc nulls last,
    case when p_sort = 'rating' then p.rating_avg end desc nulls last,
    p.created_at desc
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0);
$$;

grant execute on function public.search_products to anon, authenticated;
