import { Helmet } from "react-helmet-async";
import { useTranslation } from 'react-i18next';

interface SEOProps {
  title?: string;
  description?: string;
  keywords?: string;
  ogImage?: string;
  ogType?: string;
  canonical?: string;
  noindex?: boolean;
}

const SITE_NAME = 'getgrant.ai';
const BASE_URL = 'https://getgrant.ai';
const DEFAULT_DESC = 'AI-driven bidragsplattform för svenska företag. Hitta rätt bidrag och ansök på minuter. 2 000+ bidrag från Vinnova, Almi, EU och svenska regioner.';

export function SEO({
  title,
  description,
  keywords,
  ogImage = "https://getgrant.ai/og-image.png",
  ogType = "website",
  canonical,
  noindex = false,
}: SEOProps) {
  const { t, i18n } = useTranslation();

  const defaultDescription = t('seo.defaultDescription', { defaultValue: DEFAULT_DESC });
  const defaultKeywords = t('seo.defaultKeywords', { defaultValue: 'bidrag, företagsbidrag, innovation bidrag, EU-bidrag, Vinnova, Almi, bidragsansökan, statliga stöd, finansiering företag, Swedish grants' });

  const resolvedDescription = description ?? defaultDescription;
  const resolvedKeywords = keywords ?? defaultKeywords;
  const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} – Hitta svenska bidrag med AI`;
  const canonicalUrl = canonical ? `${BASE_URL}${canonical}` : undefined;

  const langMap: Record<string, string> = {
    sv: 'Swedish',
    en: 'English',
    no: 'Norwegian',
    fi: 'Finnish',
  };

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={resolvedDescription} />
      <meta name="keywords" content={resolvedKeywords} />
      <meta name="author" content="getgrant.ai" />

      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={resolvedDescription} />
      <meta property="og:type" content={ogType} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:locale" content={i18n.language === 'sv' ? 'sv_SE' : i18n.language === 'no' ? 'nb_NO' : i18n.language === 'fi' ? 'fi_FI' : 'en_US'} />
      {canonicalUrl && <meta property="og:url" content={canonicalUrl} />}

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={resolvedDescription} />
      <meta name="twitter:image" content={ogImage} />
      {canonicalUrl && <meta name="twitter:url" content={canonicalUrl} />}

      {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}

      <meta name="robots" content={noindex ? "noindex, nofollow" : "index, follow"} />
      <meta name="language" content={langMap[i18n.language] || 'Swedish'} />
      <meta httpEquiv="Content-Language" content={i18n.language} />
    </Helmet>
  );
}
