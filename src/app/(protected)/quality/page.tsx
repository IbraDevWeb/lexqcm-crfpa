import { LegalQualitySummary } from '@/components/legal-quality-summary'
import { LibraryPageClient } from '@/components/library-page-client'

export const metadata = { title: 'Qualité & sources' }

export default function QualityPage() {
  return <><LegalQualitySummary /><LibraryPageClient view="quality" /></>
}
