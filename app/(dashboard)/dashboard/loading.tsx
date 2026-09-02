import { PageSkeleton } from '@/components/ui/PageSkeleton'

export default function Loading() {
  return <PageSkeleton kpis={4} rows={5} columns={5} />
}
