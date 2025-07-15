import React, { useState, useRef } from 'react';
import { Modal, Button, Form, Alert, Table, Badge, ProgressBar, Spinner } from 'react-bootstrap';
import { FaUpload, FaFile, FaCheck, FaTimes, FaExclamationTriangle } from 'react-icons/fa';
import { bulkOperationsAPI } from '../services/api';
import { toast } from 'react-toastify';

const M3U8Upload = ({ show, onHide, onImportSuccess }) => {
  const [uploadStep, setUploadStep] = useState('upload'); // 'upload', 'preview', 'importing'
  const [selectedFile, setSelectedFile] = useState(null);
  const [parseResult, setParseResult] = useState(null);
  const [importProgress, setImportProgress] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // Reset modal state when closing
  const handleClose = () => {
    setUploadStep('upload');
    setSelectedFile(null);
    setParseResult(null);
    setImportProgress(null);
    setDragOver(false);
    onHide();
  };

  // Handle file selection
  const handleFileSelect = (file) => {
    // Validate file type
    if (!file.name.toLowerCase().endsWith('.m3u8') && !file.name.toLowerCase().endsWith('.m3u')) {
      toast.error('Please select a valid M3U8 file');
      return;
    }

    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size exceeds 10MB limit');
      return;
    }

    setSelectedFile(file);
  };

  // Handle file input change
  const handleFileInputChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  // Handle drag and drop
  const handleDragOver = (event) => {
    event.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragOver(false);
    
    const files = event.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  // Parse M3U8 file
  const handleParseFile = async () => {
    if (!selectedFile) return;

    try {
      setUploadStep('parsing');
      const response = await bulkOperationsAPI.parseM3U8(selectedFile);
      
      if (response.data.success) {
        setParseResult(response.data.data);
        setUploadStep('preview');
      } else {
        toast.error(response.data.error || 'Failed to parse M3U8 file');
        setUploadStep('upload');
      }
    } catch (error) {
      console.error('Error parsing M3U8 file:', error);
      toast.error('Error parsing M3U8 file. Please try again.');
      setUploadStep('upload');
    }
  };

  // Import channels
  const handleImportChannels = async () => {
    if (!parseResult?.validationResults?.validEntries) return;

    try {
      setUploadStep('importing');
      setImportProgress({ current: 0, total: parseResult.validationResults.validEntries.length });

      const response = await bulkOperationsAPI.importChannels(parseResult.validationResults.validEntries);
      
      if (response.data.success) {
        const results = response.data.data;
        toast.success(`Successfully imported ${results.imported} channels`);
        
        if (results.failed > 0) {
          toast.warning(`${results.failed} channels failed to import`);
        }
        
        onImportSuccess?.(results);
        handleClose();
      } else {
        toast.error('Failed to import channels');
        setUploadStep('preview');
      }
    } catch (error) {
      console.error('Error importing channels:', error);
      toast.error('Error importing channels. Please try again.');
      setUploadStep('preview');
    }
  };

  // Render upload step
  const renderUploadStep = () => (
    <div className="text-center py-4">
      <div
        className={`border-2 border-dashed rounded p-4 mb-3 ${
          dragOver ? 'border-primary bg-light' : 'border-secondary'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{ minHeight: '200px', cursor: 'pointer' }}
        onClick={() => fileInputRef.current?.click()}
      >
        <FaFile size={48} className="text-muted mb-3" />
        <p className="mb-2">
          {selectedFile ? (
            <>
              <strong>{selectedFile.name}</strong>
              <br />
              <small className="text-muted">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </small>
            </>
          ) : (
            <>
              Drag and drop your M3U8 file here, or click to browse
              <br />
              <small className="text-muted">Maximum file size: 10MB</small>
            </>
          )}
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".m3u8,.m3u"
          onChange={handleFileInputChange}
          style={{ display: 'none' }}
        />
      </div>
      
      {selectedFile && (
        <Button variant="primary" onClick={handleParseFile}>
          <FaUpload className="me-2" />
          Parse M3U8 File
        </Button>
      )}
    </div>
  );

  // Render preview step
  const renderPreviewStep = () => {
    if (!parseResult) return null;

    const { preview, validationResults } = parseResult;

    return (
      <div>
        <Alert variant="info" className="mb-3">
          <strong>Import Summary:</strong>
          <ul className="mb-0 mt-2">
            <li>{preview.summary.valid} valid channels ready for import</li>
            <li>{preview.summary.invalid} invalid channels (will be skipped)</li>
            <li>{preview.summary.duplicates} duplicate channels (will be skipped)</li>
          </ul>
        </Alert>

        {preview.recommendations.length > 0 && (
          <Alert variant="warning" className="mb-3">
            <strong>Recommendations:</strong>
            <ul className="mb-0 mt-2">
              {preview.recommendations.map((rec, index) => (
                <li key={index}>{rec.message}</li>
              ))}
            </ul>
          </Alert>
        )}

        {/* Valid channels preview */}
        {preview.sampleValid.length > 0 && (
          <div className="mb-3">
            <h6>Valid Channels (showing first 5):</h6>
            <Table striped bordered hover size="sm">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>URL</th>
                  <th>Type</th>
                  <th>Category</th>
                </tr>
              </thead>
              <tbody>
                {preview.sampleValid.map((channel, index) => (
                  <tr key={index}>
                    <td>{channel.name}</td>
                    <td className="text-truncate" style={{ maxWidth: '200px' }}>
                      <small>{channel.url}</small>
                    </td>
                    <td>
                      <Badge bg="primary">{channel.type}</Badge>
                    </td>
                    <td>{channel.category}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {validationResults.validEntries.length > 5 && (
              <small className="text-muted">
                ... and {validationResults.validEntries.length - 5} more channels
              </small>
            )}
          </div>
        )}

        {/* Invalid channels preview */}
        {preview.sampleInvalid.length > 0 && (
          <div className="mb-3">
            <h6 className="text-danger">Invalid Channels (showing first 5):</h6>
            <Table striped bordered hover size="sm">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Errors</th>
                </tr>
              </thead>
              <tbody>
                {preview.sampleInvalid.map((item, index) => (
                  <tr key={index}>
                    <td>
                      <small>{JSON.stringify(item.data)}</small>
                    </td>
                    <td>
                      {item.errors.map((error, i) => (
                        <Badge key={i} bg="danger" className="me-1">
                          {error}
                        </Badge>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}

        {/* Duplicates preview */}
        {preview.sampleDuplicates.length > 0 && (
          <div className="mb-3">
            <h6 className="text-warning">Duplicate Channels (showing first 5):</h6>
            <Table striped bordered hover size="sm">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>URL</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {preview.sampleDuplicates.map((channel, index) => (
                  <tr key={index}>
                    <td>{channel.name}</td>
                    <td className="text-truncate" style={{ maxWidth: '200px' }}>
                      <small>{channel.url}</small>
                    </td>
                    <td>
                      <Badge bg="warning">{channel.reason}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </div>
    );
  };

  // Render importing step
  const renderImportingStep = () => (
    <div className="text-center py-4">
      <Spinner animation="border" variant="primary" className="mb-3" />
      <h5>Importing Channels...</h5>
      {importProgress && (
        <div className="mt-3">
          <ProgressBar 
            now={(importProgress.current / importProgress.total) * 100} 
            label={`${importProgress.current}/${importProgress.total}`}
          />
        </div>
      )}
    </div>
  );

  return (
    <Modal show={show} onHide={handleClose} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>
          <FaUpload className="me-2" />
          Import Channels from M3U8
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {uploadStep === 'upload' && renderUploadStep()}
        {uploadStep === 'parsing' && (
          <div className="text-center py-4">
            <Spinner animation="border" variant="primary" className="mb-3" />
            <h5>Parsing M3U8 file...</h5>
          </div>
        )}
        {uploadStep === 'preview' && renderPreviewStep()}
        {uploadStep === 'importing' && renderImportingStep()}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={handleClose} disabled={uploadStep === 'importing'}>
          Cancel
        </Button>
        {uploadStep === 'upload' && selectedFile && (
          <Button variant="primary" onClick={handleParseFile}>
            Parse File
          </Button>
        )}
        {uploadStep === 'preview' && parseResult?.validationResults?.validEntries?.length > 0 && (
          <Button variant="success" onClick={handleImportChannels}>
            <FaCheck className="me-2" />
            Import {parseResult.validationResults.validEntries.length} Channels
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
};

export default M3U8Upload;
