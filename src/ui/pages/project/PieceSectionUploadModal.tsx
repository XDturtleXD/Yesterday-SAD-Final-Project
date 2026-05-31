import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import * as conversionsApi from '../../../api/conversions'
import * as scoresApi from '../../../api/scores'
import type { Piece, Project, Section } from '../../../types'
import { sectionLabel } from '../../../utils/sectionLabels'
import { Button } from '../../primitives/Button'
import { Modal } from '../../primitives/Modal'
import { FileUp, Upload } from 'lucide-react'

type Props = {
  project: Project
  piece: Piece
  section: Section
  open: boolean
  onClose: () => void
  onUploaded: () => Promise<void>
}

export function PieceSectionUploadModal({
  project,
  piece,
  section,
  open,
  onClose,
  onUploaded,
}: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [preprocessMode, setPreprocessMode] = useState('none')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [conversionJob, setConversionJob] = useState<conversionsApi.ApiConversionStart | null>(null)
  const [conversionStatus, setConversionStatus] =
    useState<conversionsApi.ApiConversionStatus | null>(null)
  const [convertedXml, setConvertedXml] = useState('')
  const currentSectionLabel = sectionLabel(section)

  useEffect(() => {
    if (!open) return
    // Reset modal-local state whenever the upload dialog is opened for a new target.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFile(null)
    setUploadError(null)
    setPreprocessMode('none')
    setConversionJob(null)
    setConversionStatus(null)
    setConvertedXml('')
    setTitle(`${piece.title} - ${currentSectionLabel}`)
  }, [currentSectionLabel, open, piece.id, piece.title, section.id])

  useEffect(() => {
    if (!open || !conversionJob) return
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
  }, [conversionJob, conversionStatus?.status, open])

  const conversionDone = conversionStatus?.status === 'done' && Boolean(convertedXml)
  const conversionInProgress =
    Boolean(conversionJob) && !conversionDone && conversionStatus?.status !== 'error'
  const isPdf = file?.name.toLowerCase().endsWith('.pdf') ?? false
  const showConversionStatus = conversionStatus && !conversionDone

  function handleClose() {
    if (uploading || importing || conversionInProgress) return
    onClose()
  }

  async function submitUpload(event: FormEvent) {
    event.preventDefault()
    if (!file) {
      setUploadError('Choose a file')
      return
    }
    if (!/\.(pdf|xml|musicxml|mxl)$/i.test(file.name)) {
      setUploadError('Only PDF, .xml, .musicxml, and .mxl files are supported')
      return
    }
    if (!title.trim()) {
      setUploadError('Score title is required')
      return
    }

    setUploading(true)
    setUploadError(null)
    try {
      const result = await scoresApi.uploadProjectScoreFile(project.id, {
        file,
        title: title.trim(),
        sectionId: section.id,
        pieceId: piece.id,
        preprocessMode: isPdf ? preprocessMode : undefined,
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
      } else {
        await onUploaded()
        onClose()
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function importConvertedScore() {
    if (!conversionJob) return

    setImporting(true)
    setUploadError(null)
    try {
      await conversionsApi.importConversion(project.id, conversionJob.jobId, {
        title: title.trim(),
        sectionId: section.id,
        pieceId: piece.id,
        originalFilename: conversionJob.originalFilename.replace(/\.pdf$/i, '.musicxml'),
      })
      await onUploaded()
      onClose()
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <Modal
      title={`Upload part · ${piece.title}`}
      open={open}
      onClose={handleClose}
      maxWidthClassName="h-[min(640px,calc(100vh-2rem))] max-w-2xl"
      bodyClassName="flex-1"
      footer={
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
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
            <Button type="submit" form="piece-section-upload-form" disabled={uploading}>
              <Upload className="size-4" />
              {uploading ? 'Uploading...' : isPdf ? 'Upload & Convert' : 'Upload'}
            </Button>
          )}
        </div>
      }
    >
      <form id="piece-section-upload-form" className="space-y-4" onSubmit={submitUpload}>
        <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
          Supports PDF with automatic MusicXML conversion, plus .musicxml, .xml, and .mxl files.
        </div>

        <div>
          <label className="text-sm font-medium text-slate-800" htmlFor="piece-section-file">
            Score file
          </label>
          <input
            id="piece-section-file"
            type="file"
            accept=".pdf,.xml,.musicxml,.mxl"
            disabled={Boolean(conversionJob)}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null)
              setUploadError(null)
            }}
            className="mt-1 block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-slate-800" htmlFor="piece-section-title">
            Score title
          </label>
          <input
            id="piece-section-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
          />
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
            <div className="flex items-center gap-2 font-medium">
              <FileUp className="size-4" />
              Conversion complete — ready to import
            </div>
          </div>
        )}
      </form>
    </Modal>
  )
}
