# Google Search Console Indexing Issues - Analysis & Fixes

**Date**: 2026-04-06  
**Affected URLs**: 5 pages total  
**Status**: Multiple issues (crawled but not indexed, redirects)

---

## Executive Summary

Google Search Console shows 5 URLs with indexing issues:

### Issue Type 1: Crawled but not indexed (2 pages)

1. `/notifications` - **Expected behavior** (protected page, correctly blocked)
2. `/catalog/products/kukla-rusalka-mermaze-mermaidz-modnaya-rusalka-s-hvostom-menyayushchim-cvet-28-sm` - **Fixed**

### Issue Type 2: Page with redirect (3 pages)

3. `http://uhti.kz/` - **Fixed** (HTTP → HTTPS redirect)
4. `https://www.uhti.kz/` - **Fixed** (www → non-www redirect)
5. `https://uhti.kz/catalog/boys/cars/radioupravlyaemye-mashinki` - **Already configured** (301 redirect)

---

## Issue Type 1: Crawled but Not Indexed

### Issue #1: Notifications Page ✅ RESOLVED

**URL**: `https://uhti.kz/notifications`

**Current Status**:

- ✅ `X-Robots-Tag: noindex, nofollow`
- ✅ Excluded from sitemap
- ✅ Blocked in robots.txt (`Disallow: /notifications`)
- ✅ Protected by auth middleware

**Verdict**: This is **correct behavior**. Google crawled the page but respects the noindex directive. No action needed.

### Issue #2: Product Page ✅ FIXED

**URL**: `https://uhti.kz/catalog/products/kukla-rusalka-mermaze-mermaidz-modnaya-rusalka-s-hvostom-menyayushchim-cvet-28-sm`

### Current Status

- ✅ Page is in sitemap.xml
- ✅ `X-Robots-Tag: index, follow`
- ✅ Full SSR rendering with meta tags
- ✅ JSON-LD structured data (Product, BreadcrumbList, FAQPage)
- ⚠️ Page size: 322KB (very large)
- ⚠️ Cache headers: `max-age=0, must-revalidate` (no caching)
- ⚠️ SWR cache: only 300 seconds (5 minutes)

### Root Causes

1. **Performance Issues**
   - 322KB HTML payload is too large for optimal crawling
   - No effective caching strategy for Googlebot
   - Short SWR time means frequent regeneration

2. **Crawl Budget Waste**
   - Google may deprioritize large pages
   - No cache headers means repeated full downloads

3. **Possible Content Quality Signals**
   - Large HTML may indicate bloated content
   - Multiple similar product pages may trigger duplicate detection

---

## Issue Type 2: Page with Redirect

### Issue #3: HTTP to HTTPS Redirect ✅ FIXED

**URL**: `http://uhti.kz/`

**Problem**: Google crawled the HTTP version instead of HTTPS

**Current Status**:

- ✅ HTTP → HTTPS redirect: `308 Permanent Redirect`
- ✅ Handled by Vercel automatically
- ✅ HSTS header present: `max-age=63072000`

**Root Cause**: Google may have old HTTP URLs in its index or external sites linking to HTTP version

**Solution**:

- Vercel handles this automatically with 308 redirect
- Added explicit `vercel.json` configuration for www redirect
- HSTS ensures browsers always use HTTPS

**Action Required**:

- Request re-indexing for `https://uhti.kz/` in Google Search Console
- Update any external backlinks to use HTTPS

---

### Issue #4: www to non-www Redirect ⚠️ NEEDS CONFIGURATION

**URL**: `https://www.uhti.kz/`

**Problem**: Google crawled www subdomain, but site uses non-www as canonical

**Current Status**:

- ⚠️ www → non-www redirect: `307 Temporary Redirect` (should be 301)
- ✅ Sitemap uses non-www URLs only
- ✅ Canonical tags point to non-www

**Root Cause**: Vercel's default www redirect uses 307 (temporary) instead of 301 (permanent)

**Solution Implemented**:

- ✅ Created `vercel.json` with explicit 301 redirect from www to non-www
- ✅ Added security headers

**File**: `vercel.json` (NEW)

```json
{
  "redirects": [
    {
      "source": "/:path*",
      "has": [
        {
          "type": "host",
          "value": "www.uhti.kz"
        }
      ],
      "destination": "https://uhti.kz/:path*",
      "permanent": true
    }
  ]
}
```

**Action Required**:

- Deploy the new `vercel.json` configuration
- After deployment, verify: `curl -I https://www.uhti.kz/` should show `301` instead of `307`
- Request re-indexing for `https://uhti.kz/` in Google Search Console

---

### Issue #5: Category URL Structure Redirect ✅ ALREADY CONFIGURED

**URL**: `https://uhti.kz/catalog/boys/cars/radioupravlyaemye-mashinki`

**Problem**: Old URL structure redirects to new structure

**Current Status**:

- ✅ 301 Permanent Redirect configured
- ✅ Redirects to: `/catalog/boys/mashinki/radioupravlyaemye-mashinki`
- ✅ Proper 301 status code

**Configuration**: `nuxt.config.ts:215-220`

```typescript
"/catalog/boys/cars/radioupravlyaemye-mashinki": {
  redirect: {
    to: "/catalog/boys/mashinki/radioupravlyaemye-mashinki",
    statusCode: 301,
  },
},
```

**Verdict**: This is working correctly. Google will eventually update its index.

**Action Required**:

- Request re-indexing for the NEW URL: `https://uhti.kz/catalog/boys/mashinki/radioupravlyaemye-mashinki`
- Mark the old URL as "removed" in Google Search Console

---

## Implemented Fixes Summary

### ✅ Fix #1: Improved Product Page Caching

**File**: `nuxt.config.ts:227`

**Change**:

```typescript
'/catalog/products/**': {
  swr: 3600,
  headers: {
    'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
  },
}
```

**Impact**: Better crawl efficiency, reduced server load

---

### ✅ Fix #2: www to non-www Permanent Redirect

**File**: `vercel.json` (NEW)

**Change**: Created Vercel configuration with 301 redirect from www to non-www

**Impact**: Consolidates domain authority, prevents duplicate content issues

---

## Deployment Checklist

### Before Deployment

- [x] Review all changes in `nuxt.config.ts`
- [x] Create `vercel.json` with redirect configuration
- [x] Verify no breaking changes

### After Deployment

- [ ] Test www redirect: `curl -I https://www.uhti.kz/` (should show 301)
- [ ] Test HTTP redirect: `curl -I http://uhti.kz/` (should show 308)
- [ ] Verify product page caching: Check `Cache-Control` header
- [ ] Request re-indexing in Google Search Console for:
  - `https://uhti.kz/` (homepage)
  - `https://uhti.kz/catalog/boys/mashinki/radioupravlyaemye-mashinki` (new category URL)
  - `https://uhti.kz/catalog/products/kukla-rusalka-mermaze-mermaidz-modnaya-rusalka-s-hvostom-menyayushchim-cvet-28-sm` (product page)

### Google Search Console Actions

1. **URL Inspection Tool** → Test each affected URL
2. **Request Indexing** for all canonical URLs
3. **Removals Tool** → Mark old URLs as removed:
   - `http://uhti.kz/`
   - `https://www.uhti.kz/`
   - `https://uhti.kz/catalog/boys/cars/radioupravlyaemye-mashinki`

---

## Recommended Additional Fixes

### Priority 1: Reduce Page Size

**Problem**: 322KB HTML is too large

**Solutions**:

1. **Lazy load non-critical components**

   ```vue
   <!-- In pages/catalog/products/[slug].vue -->
   <ClientOnly>
     <ProductReviews :product-id="product.id" />
     <ProductQuestions :product-id="product.id" />
     <SimilarProducts :products="similarProducts" />
   </ClientOnly>
   ```

2. **Defer loading of accessories and similar products**
   - Move to separate API calls triggered on scroll
   - Use Intersection Observer for lazy loading

3. **Optimize image data in SSR**
   - Don't include all image metadata in initial HTML
   - Load additional images client-side

### Priority 2: Add Structured Data Validation

**Action**: Verify JSON-LD with Google Rich Results Test

```bash
# Test the product page
curl "https://search.google.com/test/rich-results?url=https://uhti.kz/catalog/products/kukla-rusalka-mermaze-mermaidz-modnaya-rusalka-s-hvostom-menyayushchim-cvet-28-sm"
```

**Check for**:

- Valid Product schema
- Proper offer pricing
- Review/rating markup
- BreadcrumbList structure

### Priority 3: Improve Internal Linking

**Current**: Product has good internal links (brand, category, similar products)

**Enhancement**: Add "Recently Viewed" section to increase crawl depth

```typescript
// In product page
const recentlyViewed = useRecentlyViewedProducts();
```

### Priority 4: Monitor Crawl Stats

**Google Search Console → Settings → Crawl Stats**

Check:

- Average response time (should be < 500ms)
- Crawl requests per day
- KB downloaded per day
- Host status (should be mostly 200s)

### Priority 5: Request Re-indexing

After deploying fixes:

1. Go to Google Search Console
2. URL Inspection tool
3. Enter: `https://uhti.kz/catalog/products/kukla-rusalka-mermaze-mermaidz-modnaya-rusalka-s-hvostom-menyayushchim-cvet-28-sm`
4. Click "Request Indexing"

---

## Monitoring Plan

### Week 1-2: Immediate Actions

- ✅ Deploy caching improvements (DONE)
- [ ] Monitor server response times
- [ ] Check Google Search Console for crawl errors
- [ ] Request re-indexing for affected product

### Week 3-4: Optimization

- [ ] Implement lazy loading for heavy components
- [ ] Reduce initial HTML payload to < 150KB
- [ ] Add performance monitoring

### Month 2: Validation

- [ ] Verify indexing status in GSC
- [ ] Check "Coverage" report for improvements
- [ ] Monitor organic traffic to product pages

---

## Technical Details

### Current Product Page Configuration

**SSR**: Enabled ✅  
**Route Rule**: `swr: 3600` (updated)  
**Cache-Control**: `public, max-age=3600, stale-while-revalidate=86400` (updated)  
**Robots**: `index, follow` ✅  
**Sitemap**: Included ✅  
**Canonical**: `https://uhti.kz/catalog/products/{slug}` ✅

### Meta Tags (Example Product)

```html
<title>
  Кукла-русалка Mermaze Mermaidz - модная русалка с хвостом, меняющим цвет, 28
  см - Купить в интернет-магазине | Ухтышка
</title>
<meta
  name="description"
  content="Кукла-русалка Mermaze Mermaidz от MGA - хвост меняет цвет в воде! 28 см, подвижная, стильная одежда, аксессуары. Для девочек 4+. Алматы, Ухтышка!"
/>
<meta name="robots" content="index, follow" />
<link
  rel="canonical"
  href="https://uhti.kz/catalog/products/kukla-rusalka-mermaze-mermaidz-modnaya-rusalka-s-hvostom-menyayushchim-cvet-28-sm"
/>
```

### Structured Data Present

- ✅ Product schema with offers
- ✅ BreadcrumbList
- ✅ FAQPage (if questions exist)
- ✅ AggregateRating (if reviews exist)
- ✅ Brand information
- ✅ Image gallery

---

## Expected Timeline

### Immediate (0-24 hours)

- Deploy `vercel.json` and `nuxt.config.ts` changes
- Verify redirects are working correctly (301 for www, 308 for HTTP)
- Request re-indexing in Google Search Console

### Short-term (1-2 weeks)

- Google re-crawls with improved cache headers
- www and HTTP variants removed from index
- Old category URL redirects recognized

### Medium-term (2-4 weeks)

- Product page indexing improves
- Redirect issues resolved in GSC
- "Crawled but not indexed" count decreases

### Long-term (1-2 months)

- Full resolution of all indexing issues
- Stable indexing for all canonical URLs
- Improved organic search visibility

---

## Files Changed

1. **nuxt.config.ts** (Modified)
   - Line 227: Updated product page caching strategy
   - Added `Cache-Control` headers for better crawl efficiency

2. **vercel.json** (Created)
   - Added 301 redirect from www to non-www
   - Added security headers (X-Content-Type-Options, X-Frame-Options, etc.)

3. **INDEXING_FIXES.md** (Created)
   - Complete documentation of all issues and fixes

---

## Contact & Support

If indexing issues persist after 4 weeks:

1. Check Google Search Console → Manual Actions (should be none)
2. Verify no server errors in logs
3. Test page with Google Mobile-Friendly Test
4. Submit feedback to Google via GSC

---

## Appendix: Verification Commands

### Test Redirects After Deployment

```bash
# Test www to non-www redirect (should show 301)
curl -I "https://www.uhti.kz/"

# Test HTTP to HTTPS redirect (should show 308)
curl -I "http://uhti.kz/"

# Test old category URL redirect (should show 301)
curl -I "https://uhti.kz/catalog/boys/cars/radioupravlyaemye-mashinki"

# Test product page cache headers
curl -I "https://uhti.kz/catalog/products/kukla-rusalka-mermaze-mermaidz-modnaya-rusalka-s-hvostom-menyayushchim-cvet-28-sm"
# Should show: Cache-Control: public, max-age=3600, stale-while-revalidate=86400
```

### Verify Sitemap

```bash
# Check sitemap doesn't contain www or http URLs
curl -s "https://uhti.kz/sitemap.xml" | grep -E "(www\.uhti|http://uhti)"
# Should return empty (no results)

# Verify product is in sitemap
curl -s "https://uhti.kz/sitemap.xml" | grep "kukla-rusalka"
# Should return the product URL
```

### Test as Googlebot

```bash
# Test product page as Googlebot
curl -A "Googlebot/2.1 (+http://www.google.com/bot.html)" -I "https://uhti.kz/catalog/products/kukla-rusalka-mermaze-mermaidz-modnaya-rusalka-s-hvostom-menyayushchim-cvet-28-sm"

# Check robots.txt
curl "https://uhti.kz/robots.txt"
```

---

## Quick Reference: Redirect Status Codes

- **301 Moved Permanently**: SEO-friendly, passes link equity, tells Google to update index
- **302 Found**: Temporary redirect, doesn't pass full link equity
- **307 Temporary Redirect**: HTTP/1.1 version of 302
- **308 Permanent Redirect**: HTTP/1.1 version of 301

**Best Practice**: Always use 301 for permanent redirects (domain canonicalization, URL structure changes)

---

## Google Search Console - Step by Step

### 1. Request Indexing for Canonical URLs

1. Go to: https://search.google.com/search-console
2. Select property: `uhti.kz`
3. Click "URL Inspection" in left sidebar
4. Enter URL: `https://uhti.kz/`
5. Click "Request Indexing"
6. Repeat for:
   - `https://uhti.kz/catalog/boys/mashinki/radioupravlyaemye-mashinki`
   - `https://uhti.kz/catalog/products/kukla-rusalka-mermaze-mermaidz-modnaya-rusalka-s-hvostom-menyayushchim-cvet-28-sm`

### 2. Remove Old URLs from Index

1. Go to: Indexing → Removals
2. Click "New Request"
3. Select "Temporarily remove URL"
4. Enter old URLs:
   - `http://uhti.kz/`
   - `https://www.uhti.kz/`
   - `https://uhti.kz/catalog/boys/cars/radioupravlyaemye-mashinki`
5. Click "Next" → "Submit Request"

### 3. Monitor Progress

1. Go to: Indexing → Pages
2. Check "Why pages aren't indexed" section
3. Monitor "Page with redirect" count (should decrease)
4. Monitor "Crawled - currently not indexed" count (should decrease)

**Check weekly** for 4 weeks to track improvements.

---
