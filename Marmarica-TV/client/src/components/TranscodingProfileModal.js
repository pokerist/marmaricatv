import React, { useState, useEffect } from 'react';
import { Modal, Button, Form, Row, Col, Alert, Spinner, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { transcodingProfilesAPI } from '../services/api';
import { toast } from 'react-toastify';

const TranscodingProfileModal = ({ show, onHide, profile, onSuccess }) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    video_codec: 'libx264',
    audio_codec: 'aac',
    video_bitrate: '2000k',
    audio_bitrate: '128k',
    resolution: '1080p',
    preset: 'veryfast',
    tune: 'zerolatency',
    gop_size: 50,
    keyint_min: 50,
    hls_time: 4,
    hls_list_size: 3,
    additional_params: '',
    is_default: false
  });

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const isEdit = Boolean(profile);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (show) {
      if (profile) {
        setFormData({
          name: profile.name || '',
          description: profile.description || '',
          video_codec: profile.video_codec || 'libx264',
          audio_codec: profile.audio_codec || 'aac',
          video_bitrate: profile.video_bitrate || '2000k',
          audio_bitrate: profile.audio_bitrate || '128k',
          resolution: profile.resolution || '1080p',
          preset: profile.preset || 'veryfast',
          tune: profile.tune || 'zerolatency',
          gop_size: profile.gop_size || 50,
          keyint_min: profile.keyint_min || 50,
          hls_time: profile.hls_time || 4,
          hls_list_size: profile.hls_list_size || 3,
          additional_params: profile.additional_params || '',
          is_default: Boolean(profile.is_default)
        });
      } else {
        setFormData({
          name: '',
          description: '',
          video_codec: 'libx264',
          audio_codec: 'aac',
          video_bitrate: '2000k',
          audio_bitrate: '128k',
          resolution: '1080p',
          preset: 'veryfast',
          tune: 'zerolatency',
          gop_size: 50,
          keyint_min: 50,
          hls_time: 4,
          hls_list_size: 3,
          additional_params: '',
          is_default: false
        });
      }
      setErrors({});
    }
  }, [show, profile]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.name.trim()) {
      newErrors.name = 'Profile name is required';
    }
    
    if (!formData.video_codec.trim()) {
      newErrors.video_codec = 'Video codec is required';
    }
    
    if (!formData.audio_codec.trim()) {
      newErrors.audio_codec = 'Audio codec is required';
    }
    
    if (!formData.preset.trim()) {
      newErrors.preset = 'Preset is required';
    }
    
    if (!formData.video_bitrate.trim()) {
      newErrors.video_bitrate = 'Video bitrate is required';
    }
    
    if (!formData.audio_bitrate.trim()) {
      newErrors.audio_bitrate = 'Audio bitrate is required';
    }
    
    if (formData.gop_size < 1 || formData.gop_size > 1000) {
      newErrors.gop_size = 'GOP size must be between 1 and 1000';
    }
    
    if (formData.keyint_min < 1 || formData.keyint_min > 1000) {
      newErrors.keyint_min = 'Keyframe interval must be between 1 and 1000';
    }
    
    if (formData.hls_time < 1 || formData.hls_time > 60) {
      newErrors.hls_time = 'HLS segment time must be between 1 and 60 seconds';
    }
    
    if (formData.hls_list_size < 1 || formData.hls_list_size > 20) {
      newErrors.hls_list_size = 'HLS list size must be between 1 and 20';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setLoading(true);
    
    try {
      const profileData = {
        ...formData,
        gop_size: parseInt(formData.gop_size),
        keyint_min: parseInt(formData.keyint_min),
        hls_time: parseInt(formData.hls_time),
        hls_list_size: parseInt(formData.hls_list_size)
      };
      
      let response;
      if (isEdit) {
        response = await transcodingProfilesAPI.updateProfile(profile.id, profileData);
      } else {
        response = await transcodingProfilesAPI.createProfile(profileData);
      }
      
      toast.success(response.data.message || `Profile ${isEdit ? 'updated' : 'created'} successfully`);
      onSuccess();
      onHide();
    } catch (error) {
      console.error('Error saving profile:', error);
      toast.error(`Failed to ${isEdit ? 'update' : 'create'} profile`);
    } finally {
      setLoading(false);
    }
  };

  // Tooltip content for various fields
  const tooltips = {
    video_codec: "Video codec to use for transcoding. H.264 (libx264) is most compatible.",
    audio_codec: "Audio codec to use for transcoding. AAC provides good quality/size ratio.",
    video_bitrate: "Target video bitrate (e.g., 2000k = 2 Mbps). Higher = better quality but larger files.",
    audio_bitrate: "Target audio bitrate (e.g., 128k = 128 kbps). 128k is good for most content.",
    resolution: "Target resolution. 'original' keeps source resolution.",
    preset: "Encoding speed preset. Faster = lower quality but quicker encoding.",
    tune: "Optimization for specific content types. 'zerolatency' is good for live streams.",
    gop_size: "Group of Pictures size. Smaller = more frequent keyframes, better seeking.",
    keyint_min: "Minimum keyframe interval. Usually same as GOP size.",
    hls_time: "Duration of each HLS segment in seconds. 4-6 seconds is typical.",
    hls_list_size: "Number of segments to keep in playlist. 3-5 is typical.",
    additional_params: "Additional FFmpeg parameters (advanced users only)."
  };

  const renderTooltip = (field, children) => (
    <OverlayTrigger
      placement="top"
      overlay={<Tooltip>{tooltips[field]}</Tooltip>}
    >
      {children}
    </OverlayTrigger>
  );

  return (
    <Modal show={show} onHide={onHide} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>
          {isEdit ? 'Edit Transcoding Profile' : 'Create Transcoding Profile'}
        </Modal.Title>
      </Modal.Header>
      
      <Form onSubmit={handleSubmit}>
        <Modal.Body>
          <Row>
            <Col md={8}>
              <Form.Group className="mb-3">
                <Form.Label>Profile Name *</Form.Label>
                <Form.Control
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  isInvalid={!!errors.name}
                  placeholder="e.g., High Quality, Fast Encode"
                />
                <Form.Control.Feedback type="invalid">
                  {errors.name}
                </Form.Control.Feedback>
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group className="mb-3">
                <Form.Check
                  type="checkbox"
                  name="is_default"
                  label="Set as default profile"
                  checked={formData.is_default}
                  onChange={handleChange}
                  className="mt-4"
                />
              </Form.Group>
            </Col>
          </Row>
          
          <Form.Group className="mb-3">
            <Form.Label>Description</Form.Label>
            <Form.Control
              as="textarea"
              rows={2}
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Brief description of when to use this profile..."
            />
          </Form.Group>
          
          <Row>
            <Col md={6}>
              <Form.Group className="mb-3">
                {renderTooltip('video_codec', 
                  <Form.Label>Video Codec *</Form.Label>
                )}
                <Form.Select
                  name="video_codec"
                  value={formData.video_codec}
                  onChange={handleChange}
                  isInvalid={!!errors.video_codec}
                >
                  <option value="libx264">H.264 (libx264)</option>
                  <option value="libx265">H.265 (libx265)</option>
                  <option value="libvpx">VP8</option>
                  <option value="libvpx-vp9">VP9</option>
                </Form.Select>
                <Form.Control.Feedback type="invalid">
                  {errors.video_codec}
                </Form.Control.Feedback>
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group className="mb-3">
                {renderTooltip('audio_codec', 
                  <Form.Label>Audio Codec *</Form.Label>
                )}
                <Form.Select
                  name="audio_codec"
                  value={formData.audio_codec}
                  onChange={handleChange}
                  isInvalid={!!errors.audio_codec}
                >
                  <option value="aac">AAC</option>
                  <option value="mp3">MP3</option>
                  <option value="libvorbis">Vorbis</option>
                  <option value="libopus">Opus</option>
                </Form.Select>
                <Form.Control.Feedback type="invalid">
                  {errors.audio_codec}
                </Form.Control.Feedback>
              </Form.Group>
            </Col>
          </Row>
          
          <Row>
            <Col md={6}>
              <Form.Group className="mb-3">
                {renderTooltip('video_bitrate', 
                  <Form.Label>Video Bitrate *</Form.Label>
                )}
                <Form.Control
                  type="text"
                  name="video_bitrate"
                  value={formData.video_bitrate}
                  onChange={handleChange}
                  isInvalid={!!errors.video_bitrate}
                  placeholder="e.g., 2000k, 4M"
                />
                <Form.Control.Feedback type="invalid">
                  {errors.video_bitrate}
                </Form.Control.Feedback>
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group className="mb-3">
                {renderTooltip('audio_bitrate', 
                  <Form.Label>Audio Bitrate *</Form.Label>
                )}
                <Form.Control
                  type="text"
                  name="audio_bitrate"
                  value={formData.audio_bitrate}
                  onChange={handleChange}
                  isInvalid={!!errors.audio_bitrate}
                  placeholder="e.g., 128k, 192k"
                />
                <Form.Control.Feedback type="invalid">
                  {errors.audio_bitrate}
                </Form.Control.Feedback>
              </Form.Group>
            </Col>
          </Row>
          
          <Row>
            <Col md={6}>
              <Form.Group className="mb-3">
                {renderTooltip('resolution', 
                  <Form.Label>Resolution</Form.Label>
                )}
                <Form.Select
                  name="resolution"
                  value={formData.resolution}
                  onChange={handleChange}
                >
                  <option value="original">Original</option>
                  <option value="1080p">1080p (1920x1080)</option>
                  <option value="720p">720p (1280x720)</option>
                  <option value="480p">480p (854x480)</option>
                  <option value="360p">360p (640x360)</option>
                </Form.Select>
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group className="mb-3">
                {renderTooltip('preset', 
                  <Form.Label>Preset *</Form.Label>
                )}
                <Form.Select
                  name="preset"
                  value={formData.preset}
                  onChange={handleChange}
                  isInvalid={!!errors.preset}
                >
                  <option value="ultrafast">Ultra Fast</option>
                  <option value="superfast">Super Fast</option>
                  <option value="veryfast">Very Fast</option>
                  <option value="faster">Faster</option>
                  <option value="fast">Fast</option>
                  <option value="medium">Medium</option>
                  <option value="slow">Slow</option>
                  <option value="slower">Slower</option>
                  <option value="veryslow">Very Slow</option>
                </Form.Select>
                <Form.Control.Feedback type="invalid">
                  {errors.preset}
                </Form.Control.Feedback>
              </Form.Group>
            </Col>
          </Row>
          
          <Row>
            <Col md={6}>
              <Form.Group className="mb-3">
                {renderTooltip('tune', 
                  <Form.Label>Tune</Form.Label>
                )}
                <Form.Select
                  name="tune"
                  value={formData.tune}
                  onChange={handleChange}
                >
                  <option value="">None</option>
                  <option value="zerolatency">Zero Latency</option>
                  <option value="film">Film</option>
                  <option value="animation">Animation</option>
                  <option value="grain">Grain</option>
                  <option value="stillimage">Still Image</option>
                  <option value="fastdecode">Fast Decode</option>
                </Form.Select>
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group className="mb-3">
                {renderTooltip('gop_size', 
                  <Form.Label>GOP Size *</Form.Label>
                )}
                <Form.Control
                  type="number"
                  name="gop_size"
                  value={formData.gop_size}
                  onChange={handleChange}
                  isInvalid={!!errors.gop_size}
                  min="1"
                  max="1000"
                />
                <Form.Control.Feedback type="invalid">
                  {errors.gop_size}
                </Form.Control.Feedback>
              </Form.Group>
            </Col>
          </Row>
          
          <Row>
            <Col md={4}>
              <Form.Group className="mb-3">
                {renderTooltip('keyint_min', 
                  <Form.Label>Keyframe Min *</Form.Label>
                )}
                <Form.Control
                  type="number"
                  name="keyint_min"
                  value={formData.keyint_min}
                  onChange={handleChange}
                  isInvalid={!!errors.keyint_min}
                  min="1"
                  max="1000"
                />
                <Form.Control.Feedback type="invalid">
                  {errors.keyint_min}
                </Form.Control.Feedback>
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group className="mb-3">
                {renderTooltip('hls_time', 
                  <Form.Label>HLS Segment Time *</Form.Label>
                )}
                <Form.Control
                  type="number"
                  name="hls_time"
                  value={formData.hls_time}
                  onChange={handleChange}
                  isInvalid={!!errors.hls_time}
                  min="1"
                  max="60"
                />
                <Form.Control.Feedback type="invalid">
                  {errors.hls_time}
                </Form.Control.Feedback>
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group className="mb-3">
                {renderTooltip('hls_list_size', 
                  <Form.Label>HLS List Size *</Form.Label>
                )}
                <Form.Control
                  type="number"
                  name="hls_list_size"
                  value={formData.hls_list_size}
                  onChange={handleChange}
                  isInvalid={!!errors.hls_list_size}
                  min="1"
                  max="20"
                />
                <Form.Control.Feedback type="invalid">
                  {errors.hls_list_size}
                </Form.Control.Feedback>
              </Form.Group>
            </Col>
          </Row>
          
          <Form.Group className="mb-3">
            {renderTooltip('additional_params', 
              <Form.Label>Additional FFmpeg Parameters</Form.Label>
            )}
            <Form.Control
              as="textarea"
              rows={2}
              name="additional_params"
              value={formData.additional_params}
              onChange={handleChange}
              placeholder="e.g., -threads 4 -bufsize 2000k"
            />
            <Form.Text className="text-muted">
              Advanced users only. These parameters will be added to the FFmpeg command.
            </Form.Text>
          </Form.Group>
          
          {Object.keys(errors).length > 0 && (
            <Alert variant="danger">
              Please fix the validation errors above before submitting.
            </Alert>
          )}
        </Modal.Body>
        
        <Modal.Footer>
          <Button variant="secondary" onClick={onHide} disabled={loading}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={loading}>
            {loading ? (
              <>
                <Spinner size="sm" className="me-2" />
                {isEdit ? 'Updating...' : 'Creating...'}
              </>
            ) : (
              isEdit ? 'Update Profile' : 'Create Profile'
            )}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
};

export default TranscodingProfileModal;
