import type { Project } from '../../../types'
import { useAppState } from '../../../state/AppState'
import { Badge } from '../../primitives/Badge'
import { Card } from '../../primitives/Card'

export function VersionsPanel({ project }: { project: Project }) {
  const { getMemberDisplayName } = useAppState()
  const commits = project.commits

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-semibold text-slate-900">Version history (commits)</div>
        <div className="mt-1 text-sm text-slate-600">專案的 commit 紀錄。</div>
      </div>

      <Card className="overflow-hidden">
        {commits.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">尚無 commit 紀錄</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Message</th>
                  <th className="px-4 py-3 font-medium">Author</th>
                  <th className="px-4 py-3 font-medium">Timestamp</th>
                  <th className="px-4 py-3 font-medium">Branch</th>
                </tr>
              </thead>
              <tbody>
                {commits.map((c) => (
                  <tr key={c.id} className="border-t border-slate-200">
                    <td className="px-4 py-3 font-medium text-slate-900">{c.message}</td>
                    <td className="px-4 py-3">{getMemberDisplayName(c.authorUserId)}</td>
                    <td className="px-4 py-3">{c.timestamp}</td>
                    <td className="px-4 py-3">
                      <Badge tone="info">{c.branchName}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
