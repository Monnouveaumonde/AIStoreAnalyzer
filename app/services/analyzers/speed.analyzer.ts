export interface SpeedResult {
  score: number;
  details: {
    performanceScore: number;
    firstContentfulPaint: number;
    largestContentfulPaint: number;
    totalBlockingTime: number;
    cumulativeLayoutShift: number;
    speedIndex: number;
    timeToInteractive: number;
    totalPageSize: number;
    numberOfRequests: number;
  };
  issues: string[];
  recommendations: string[];
}

export async function analyzeSpeed(shopDomain: string): Promise<SpeedResult> {
  const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;
  const issues: string[] = [];
  const recommendations: string[] = [];

  let performanceData: any = null;

  if (apiKey) {
    try {
      const url = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https://${shopDomain}&key=${apiKey}&strategy=mobile&category=performance`;
      const response = await fetch(url);
      performanceData = await response.json();
    } catch (error) {
      console.error("PageSpeed API error:", error);
    }
  }

  if (performanceData?.lighthouseResult) {
    const lh = performanceData.lighthouseResult;
    const audits = lh.audits;
    const score = Math.round((lh.categories?.performance?.score || 0) * 100);

    const fcp = audits["first-contentful-paint"]?.numericValue || 0;
    const lcp = audits["largest-contentful-paint"]?.numericValue || 0;
    const tbt = audits["total-blocking-time"]?.numericValue || 0;
    const cls = audits["cumulative-layout-shift"]?.numericValue || 0;
    const si = audits["speed-index"]?.numericValue || 0;
    const tti = audits["interactive"]?.numericValue || 0;

    if (lcp > 2500) issues.push(`LCP trop lent: ${(lcp / 1000).toFixed(1)}s (objectif: <2.5s)`);
    if (fcp > 1800) issues.push(`FCP trop lent: ${(fcp / 1000).toFixed(1)}s (objectif: <1.8s)`);
    if (tbt > 200) issues.push(`TBT élevé: ${Math.round(tbt)}ms (objectif: <200ms)`);
    if (cls > 0.1) issues.push(`CLS instable: ${cls.toFixed(3)} (objectif: <0.1)`);

    if (lcp > 2500) recommendations.push("Optimisez les images hero et le chargement des fonts");
    if (tbt > 200) recommendations.push("Réduisez le JavaScript tiers et les scripts bloquants");
    if (cls > 0.1) recommendations.push("Définissez les dimensions des images/vidéos pour éviter les décalages");

    return {
      score,
      details: {
        performanceScore: score,
        firstContentfulPaint: Math.round(fcp),
        largestContentfulPaint: Math.round(lcp),
        totalBlockingTime: Math.round(tbt),
        cumulativeLayoutShift: parseFloat(cls.toFixed(3)),
        speedIndex: Math.round(si),
        timeToInteractive: Math.round(tti),
        totalPageSize: 0,
        numberOfRequests: 0,
      },
      issues,
      recommendations,
    };
  }

  return createEstimatedSpeedResult();
}

function createEstimatedSpeedResult(): SpeedResult {
  const estimatedScore = 65;

  return {
    score: estimatedScore,
    details: {
      performanceScore: estimatedScore,
      firstContentfulPaint: 2200,
      largestContentfulPaint: 3500,
      totalBlockingTime: 350,
      cumulativeLayoutShift: 0.15,
      speedIndex: 3800,
      timeToInteractive: 4500,
      totalPageSize: 0,
      numberOfRequests: 0,
    },
    issues: [
      "Analyse estimée — connectez l'API Google PageSpeed pour des données précises",
      "LCP estimé au-dessus de la limite recommandée",
    ],
    recommendations: [
      "Activez la clé API Google PageSpeed pour une analyse détaillée",
      "Optimisez les images avec le format WebP",
      "Utilisez le lazy-loading pour les images sous le fold",
      "Minimisez les apps tierces installées",
    ],
  };
}
