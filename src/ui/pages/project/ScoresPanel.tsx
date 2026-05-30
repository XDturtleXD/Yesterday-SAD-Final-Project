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
import { FileUp, Edit3, Music2, Upload } from 'lucide-react'

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

  const closeUpload = () => {
    if (uploading || importing) return
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

  const selectedFileType = file
    ? file.name.toLowerCase().endsWith('.pdf')
      ? 'PDF'
      : 'MusicXML'
    : 'No file selected'
  const isPdf = file?.name.toLowerCase().endsWith('.pdf') ?? false
  const conversionDone = conversionStatus?.status === 'done' && convertedXml

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
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        title="Upload score"
        open={uploadOpen}
        onClose={closeUpload}
        maxWidthClassName="max-w-2xl"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={closeUpload}
              disabled={uploading || importing}
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
                'mt-1 flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm transition',
                file
                  ? 'border-slate-300 bg-white text-slate-900'
                  : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300 hover:bg-slate-100',
                conversionJob ? 'cursor-not-allowed opacity-60' : '',
              ].join(' ')}
            >
              <span className="flex min-w-0 items-center gap-2">
                <FileUp className="size-4 shrink-0 text-slate-500" />
                <span className="truncate" title={file?.name}>
                  {file?.name || 'No file selected'}
                </span>
              </span>
              {!file && <span className="shrink-0 font-medium text-slate-600">Choose file</span>}
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

          {conversionStatus && (
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
            <div>
              <div className="text-sm font-medium text-slate-800">Converted MusicXML preview</div>
              <pre className="mt-1 max-h-56 overflow-auto rounded-md border border-slate-200 bg-slate-950 p-3 text-xs text-slate-100">
                {convertedXml.slice(0, 4000)}
                {convertedXml.length > 4000 ? '\n...' : ''}
              </pre>
            </div>
          )}
        </form>
      </Modal>
    </div>
  )
}
