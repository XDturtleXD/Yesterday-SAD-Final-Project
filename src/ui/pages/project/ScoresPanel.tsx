import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import * as conversionsApi from '../../../api/conversions'
import * as scoresApi from '../../../api/scores'
import { useAppState } from '../../../state/AppState'
import type { Project } from '../../../types'
import { Badge } from '../../primitives/Badge'
import { Button } from '../../primitives/Button'
import { Card } from '../../primitives/Card'
import { Modal } from '../../primitives/Modal'
import { FileUp, Edit3, Music2, Trash2, Upload } from 'lucide-react'

export function ScoresPanel({ project }: { project: Project }) {
  const navigate = useNavigate()
  const { currentUser, sections, loadSections, loadProjectDetail, addToast } = useAppState()
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [pieceTitle, setPieceTitle] = useState('')
  const [pieceComposer, setPieceComposer] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [preprocessMode, setPreprocessMode] = useState('none')
  const [conversionJob, setConversionJob] = useState<conversionsApi.ApiConversionStart | null>(null)
  const [conversionStatus, setConversionStatus] =
    useState<conversionsApi.ApiConversionStatus | null>(null)
  const [convertedXml, setConvertedXml] = useState('')
  const [importing, setImporting] = useState(false)
  const [deletingScoreId, setDeletingScoreId] = useState<string | null>(null)

  const currentMembership = useMemo(
    () => project.members.find((member) => member.userId === currentUser?.id),
    [currentUser?.id, project.members],
  )

  useEffect(() => {
    if (uploadOpen) {
      void loadSections().then((loadedSections) => {
        setSectionId((current) => current || currentMembership?.sectionId || loadedSections[0]?.id || '')
      })
    }
  }, [currentMembership?.sectionId, loadSections, uploadOpen])

  useEffect(() => {
    if (!uploadOpen || !conversionJob) return
    if (conversionStatus?.status === 'done' || conversionStatus?.status === 'error') return

    let cancelled = false
    const loadStatus = async () => {
      try {
        const status = await conversionsApi.getConversionStatus(conversionJob.jobId)
        if (cancelled) return
        if (status.status === 'done') {
          const xml = await conversionsApi.getConversionMusicXml(conversionJob.jobId)
          if (cancelled) return
          setConvertedXml(xml)
        }
        setConversionStatus(status)
      } catch (error) {
        if (!cancelled) {
          setUploadError(error instanceof Error ? error.message : 'Failed to load conversion status')
        }
      }
    }

    void loadStatus()
    const intervalId = window.setInterval(loadStatus, 2000)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [conversionJob, conversionStatus?.status, uploadOpen])

  const conversionDone = conversionStatus?.status === 'done' && Boolean(convertedXml)
  const conversionInProgress =
    Boolean(conversionJob) && !conversionDone && conversionStatus?.status !== 'error'

  const closeUpload = () => {
    if (uploading || importing || conversionInProgress) return
    resetUpload()
  }

  const resetUpload = () => {
    setUploadOpen(false)
    setUploadError(null)
    setFile(null)
    setTitle('')
    setPieceTitle('')
    setPieceComposer('')
    setSectionId('')
    setPreprocessMode('none')
    setConversionJob(null)
    setConversionStatus(null)
    setConvertedXml('')
    setImporting(false)
  }

  const onFileSelected = (nextFile: File | null) => {
    setFile(nextFile)
    setUploadError(null)
    if (!nextFile) return

    const filenameTitle = nextFile.name.replace(/\.(musicxml|xml)$/i, '')
    setTitle((value) => value || filenameTitle)
    setPieceTitle((value) => value || filenameTitle)
  }

  const uploadXmlScore = async (event: FormEvent) => {
    event.preventDefault()
    if (!file) {
      setUploadError('Please choose a MusicXML file.')
      return
    }
    if (!/\.(pdf|xml|musicxml)$/i.test(file.name)) {
      setUploadError('Only PDF, XML, and MusicXML files are supported.')
      return
    }
    if (!title.trim() || !pieceTitle.trim() || !sectionId) {
      setUploadError('Title, piece title, and section are required.')
      return
    }

    setUploading(true)
    setUploadError(null)
    try {
      const result = await scoresApi.uploadProjectScoreFile(project.id, {
        file,
        title: title.trim(),
        pieceTitle: pieceTitle.trim(),
        pieceComposer: pieceComposer.trim() || undefined,
        sectionId,
        preprocessMode,
      })
      if ('jobId' in result) {
        setConversionJob(result)
        setConversionStatus({
          job_id: result.jobId,
          status: 'queued',
          message: 'Conversion queued',
          current_page: 0,
          total_pages: 0,
          error_message: null,
          result_available: false,
          original_filename: result.originalFilename,
        })
        addToast({ title: 'Conversion started', message: result.originalFilename })
      } else {
        addToast({ title: 'Score uploaded', message: result.title })
        await loadProjectDetail(project.id, { force: true })
        resetUpload()
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const importConvertedScore = async () => {
    if (!conversionJob) return
    if (!title.trim() || !pieceTitle.trim() || !sectionId) {
      setUploadError('Title, piece title, and section are required before import.')
      return
    }

    setImporting(true)
    setUploadError(null)
    try {
      const score = await conversionsApi.importConversion(project.id, conversionJob.jobId, {
        title: title.trim(),
        pieceTitle: pieceTitle.trim(),
        pieceComposer: pieceComposer.trim() || undefined,
        sectionId,
        originalFilename: conversionJob.originalFilename.replace(/\.pdf$/i, '.musicxml'),
      })
      addToast({ title: 'Converted score imported', message: score.title })
      await loadProjectDetail(project.id, { force: true })
      resetUpload()
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  const deleteImportedScore = async (scoreId: string, scoreTitle: string) => {
    const confirmed = window.confirm(`Delete "${scoreTitle}" from this project?`)
    if (!confirmed) return

    setDeletingScoreId(scoreId)
    try {
      await scoresApi.deleteScore(scoreId)
      addToast({ title: 'Score deleted', message: scoreTitle })
      await loadProjectDetail(project.id, { force: true })
    } catch (error) {
      addToast({
        title: 'Delete failed',
        message: error instanceof Error ? error.message : 'Could not delete score',
      })
    } finally {
      setDeletingScoreId(null)
    }
  }

  const selectedFileType = file
    ? file.name.toLowerCase().endsWith('.pdf')
      ? 'PDF'
      : 'MusicXML'
    : 'No file selected'
  const isPdf = file?.name.toLowerCase().endsWith('.pdf') ?? false
  const showConversionStatus = conversionStatus && !conversionDone
  const selectedFileStatus = isPdf ? 'PDF · ready to convert' : 'MusicXML · ready to upload'
  const convertedFilename = file?.name.replace(/\.pdf$/i, '.musicxml') || 'Converted.musicxml'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-900">Scores / Parts</div>
          <div className="mt-1 text-sm text-slate-600">
            依聲部管理的樂譜。現在可先上傳 XML / MusicXML，PDF 轉檔將接著串接。
          </div>
        </div>
        <Button variant="secondary" onClick={() => setUploadOpen(true)}>
          <Upload className="size-4" />
          Upload score
        </Button>
      </div>

      {project.scores.length === 0 ? (
        <Card className="p-6">
          <div className="text-sm font-semibold text-slate-900">尚無樂譜</div>
          <div className="mt-1 text-sm text-slate-600">
            此專案還沒有上傳任何分譜。
          </div>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {project.scores.map((s) => (
            <Card key={s.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className="grid size-9 place-items-center rounded-md border border-slate-200 bg-slate-50">
                  <Music2 className="size-4 text-slate-700" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-slate-950">{s.title}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge tone="info">{s.fileType}</Badge>
                    {s.originalFilename && <Badge>{s.originalFilename}</Badge>}
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    Updated {s.updatedAt.slice(0, 10)}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <Button
                  size="sm"
                  onClick={() => navigate(`/projects/${project.id}/scores/${s.id}/editor`)}
                >
                  <Edit3 className="size-4" />
                  Open editor
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={deletingScoreId === s.id}
                  onClick={() => void deleteImportedScore(s.id, s.title)}
                >
                  <Trash2 className="size-4" />
                  {deletingScoreId === s.id ? 'Deleting...' : 'Delete'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        title="Upload score"
        open={uploadOpen}
        onClose={closeUpload}
        maxWidthClassName="h-[min(640px,calc(100vh-2rem))] max-w-2xl"
        bodyClassName="flex-1"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={closeUpload}
              disabled={uploading || importing || conversionInProgress}
            >
              Cancel
            </Button>
            {conversionJob ? (
              <Button
                type="button"
                onClick={importConvertedScore}
                disabled={!conversionDone || importing}
              >
                {importing ? 'Importing...' : 'Import converted score'}
              </Button>
            ) : (
              <Button type="submit" form="score-upload-form" disabled={uploading}>
                <Upload className="size-4" />
                {uploading
                  ? 'Uploading...'
                  : file?.name.toLowerCase().endsWith('.pdf')
                    ? 'Upload & Convert'
                    : 'Upload XML'}
              </Button>
            )}
          </div>
        }
      >
        <form id="score-upload-form" className="space-y-4" onSubmit={uploadXmlScore}>
          <div>
            <label className="text-sm font-medium text-slate-800" htmlFor="score-file">
              Score file
            </label>
            <input
              id="score-file"
              type="file"
              accept=".pdf,.xml,.musicxml"
              disabled={Boolean(conversionJob)}
              onChange={(event) => onFileSelected(event.target.files?.[0] ?? null)}
              className="sr-only"
            />
            <label
              htmlFor="score-file"
              className={[
                'mt-1 flex min-h-24 cursor-pointer items-center justify-between gap-4 rounded-lg border px-4 py-4 text-sm transition',
                file
                  ? 'border-slate-300 bg-white text-slate-900 shadow-sm'
                  : 'border-dashed border-slate-300 bg-slate-50 text-slate-600 hover:border-slate-400 hover:bg-slate-100',
                conversionJob ? 'cursor-not-allowed opacity-60' : '',
              ].join(' ')}
            >
              <span className="flex min-w-0 items-center gap-3">
                <span
                  className={[
                    'grid size-10 shrink-0 place-items-center rounded-md border',
                    file
                      ? 'border-slate-200 bg-slate-50 text-slate-600'
                      : 'border-slate-300 bg-white text-slate-500',
                  ].join(' ')}
                >
                  <FileUp className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-900" title={file?.name}>
                    {file?.name || 'Choose a PDF, XML, or MusicXML file'}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {file ? selectedFileStatus : 'Click to browse from your computer'}
                  </span>
                </span>
              </span>
              {!file && (
                <span className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 shadow-sm">
                  Choose file
                </span>
              )}
            </label>
            <div className="mt-1 text-xs text-slate-500">
              Detected file type: <span className="font-medium">{selectedFileType}</span>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-slate-800" htmlFor="score-title">
                Score title
              </label>
              <input
                id="score-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                placeholder="Violin I"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-800" htmlFor="score-section">
                Section
              </label>
              <select
                id="score-section"
                value={sectionId}
                onChange={(event) => setSectionId(event.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
              >
                <option value="">Choose section</option>
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-slate-800" htmlFor="piece-title">
                Piece title
              </label>
              <input
                id="piece-title"
                value={pieceTitle}
                onChange={(event) => setPieceTitle(event.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                placeholder="Symphony No. 9"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-800" htmlFor="piece-composer">
                Composer
              </label>
              <input
                id="piece-composer"
                value={pieceComposer}
                onChange={(event) => setPieceComposer(event.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                placeholder="Optional"
              />
            </div>
          </div>

          {isPdf && !conversionJob && (
            <div>
              <label className="text-sm font-medium text-slate-800" htmlFor="preprocess-mode">
                PDF cleanup
              </label>
              <select
                id="preprocess-mode"
                value={preprocessMode}
                onChange={(event) => setPreprocessMode(event.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
              >
                <option value="none">None</option>
                <option value="basic">Basic cleanup</option>
                <option value="classical_part">Classical score cleanup</option>
                <option value="high_contrast">High contrast</option>
                <option value="resize">Resize pages</option>
                <option value="thin_ink">Thin heavy ink</option>
              </select>
              <div className="mt-1 text-xs text-slate-500">
                Optional cleanup before PDF-to-MusicXML conversion.
              </div>
            </div>
          )}

          {uploadError && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {uploadError}
            </div>
          )}

          {showConversionStatus && (
            <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
              <div className="font-medium">PDF conversion: {conversionStatus.status}</div>
              <div className="mt-1 text-xs text-sky-800">
                {conversionStatus.message}
                {conversionStatus.total_pages > 0 &&
                  ` · page ${conversionStatus.current_page}/${conversionStatus.total_pages}`}
              </div>
              {conversionStatus.error_message && (
                <div className="mt-1 text-xs text-rose-700">{conversionStatus.error_message}</div>
              )}
            </div>
          )}

          {convertedXml && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
              <div className="font-medium">Conversion complete</div>
              <div className="mt-1 text-emerald-800">
                {convertedFilename} is ready to import.
              </div>
            </div>
          )}
        </form>
      </Modal>
    </div>
  )
}
