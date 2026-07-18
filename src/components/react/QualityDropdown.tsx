/**
 * QualityDropdown — Custom dropdown (no native select).
 *
 * Features:
 *   - Tabs for Video / Audio
 *   - Video qualities: 1080p60 (default), 1080p, 720p60, 720p, 480p, 360p, 240p, 144p
 *   - Audio formats: MP3, M4A (source max bitrate)
 *   - Only show available qualities (filtered by metadata)
 *   - Spring-animated open/close (height + opacity)
 *   - Spring-animated item hover (translateX)
 *   - Full keyboard navigation (arrow up/down, enter, escape)
 *   - ARIA compliant: listbox, option, combobox roles
 *
 * Disabled when no metadata available.
 */
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Music2, Video } from 'lucide-react';
import { useReducedMotion } from './hooks/useReducedMotion';
import { SNAPPY_SPRING, BOUNCY_SPRING, springAtTime, springDuration } from '@/lib/spring';
import styles from './QualityDropdown.module.css';

export type QualityTab = 'video' | 'audio';

export interface QualityOption {
  id: string;
  label: string;
  sublabel?: string;
  available: boolean;
}

export interface QualityDropdownProps {
  videoQualities: QualityOption[];
  audioFormats: QualityOption[];
  defaultVideoId: string;
  defaultAudioId: string;
  selectedTab: QualityTab;
  selectedVideoId: string;
  selectedAudioId: string;
  onTabChange: (tab: QualityTab) => void;
  onVideoSelect: (id: string) => void;
  onAudioSelect: (id: string) => void;
  disabled?: boolean;
  labels: {
    label: string;
    video: string;
    audio: string;
    selectQuality: string;
    default: string;
    best: string;
    available: string;
  };
}

export function QualityDropdown(props: QualityDropdownProps) {
  const {
    videoQualities,
    audioFormats,
    defaultVideoId,
    defaultAudioId,
    selectedTab,
    selectedVideoId,
    selectedAudioId,
    onTabChange,
    onVideoSelect,
    onAudioSelect,
    disabled = false,
    labels,
  } = props;

  const reducedMotion = useReducedMotion();
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const currentOptions = selectedTab === 'video' ? videoQualities : audioFormats;
  const currentSelectedId = selectedTab === 'video' ? selectedVideoId : selectedAudioId;
  const currentOnSelect = selectedTab === 'video' ? onVideoSelect : onAudioSelect;
  const availableOptions = currentOptions.filter((o) => o.available);
  const selectedOption = currentOptions.find((o) => o.id === currentSelectedId);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  // Reset highlighted index when opening or tab changes
  useEffect(() => {
    if (isOpen) {
      const selectedIndex = availableOptions.findIndex((o) => o.id === currentSelectedId);
      setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
    }
  }, [isOpen, selectedTab, currentSelectedId, availableOptions.length]);

  // Spring animation for dropdown open/close
  useEffect(() => {
    if (!listRef.current) return;
    const list = listRef.current;

    if (reducedMotion) {
      list.style.opacity = isOpen ? '1' : '0';
      list.style.pointerEvents = isOpen ? 'auto' : 'none';
      list.style.transform = isOpen ? 'translateY(0)' : 'translateY(-4px)';
      return;
    }

    if (isOpen) {
      list.style.pointerEvents = 'auto';
      const duration = springDuration(SNAPPY_SPRING) * 1000;
      const samples = 30;
      const keyframes: Keyframe[] = [];

      for (let i = 0; i <= samples; i++) {
        const t = (i / samples) * (duration / 1000);
        const offsetY = springAtTime(-8, 0, 0, SNAPPY_SPRING, t).position;
        const opacity = Math.min(1, (i / samples) * 4);
        keyframes.push({
          offset: i / samples,
          transform: `translateY(${offsetY}px)`,
          opacity,
        });
      }

      list.animate(keyframes, { duration, easing: 'linear', fill: 'forwards' });
    } else {
      list.style.pointerEvents = 'none';
      const duration = 150;
      list.animate(
        [
          { opacity: 1, transform: 'translateY(0)', offset: 0 },
          { opacity: 0, transform: 'translateY(-4px)', offset: 1 },
        ],
        { duration, easing: 'ease-out', fill: 'forwards' }
      );
    }
  }, [isOpen, reducedMotion]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    switch (e.key) {
      case 'Enter':
      case ' ':
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          setHighlightedIndex((prev) => Math.min(prev + 1, availableOptions.length - 1));
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (isOpen) {
          setHighlightedIndex((prev) => Math.max(prev - 1, 0));
        }
        break;
      case 'Escape':
        if (isOpen) {
          setIsOpen(false);
          buttonRef.current?.focus();
        }
        break;
      case 'Tab':
        if (isOpen) setIsOpen(false);
        break;
    }
  };

  const handleSelect = (id: string) => {
    currentOnSelect(id);
    setIsOpen(false);
    buttonRef.current?.focus();
  };

  return (
    <div
      ref={containerRef}
      className={`${styles.container} ${disabled ? styles.disabled : ''}`}
      onKeyDown={handleKeyDown}
    >
      <label className={styles.label}>{labels.label}</label>

      {/* Tabs */}
      <div className={styles.tabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={selectedTab === 'video'}
          className={`${styles.tab} ${selectedTab === 'video' ? styles.tabActive : ''}`}
          onClick={() => onTabChange('video')}
          disabled={disabled}
        >
          <Video size={14} />
          <span>{labels.video}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={selectedTab === 'audio'}
          className={`${styles.tab} ${selectedTab === 'audio' ? styles.tabActive : ''}`}
          onClick={() => onTabChange('audio')}
          disabled={disabled}
        >
          <Music2 size={14} />
          <span>{labels.audio}</span>
        </button>
      </div>

      {/* Trigger button */}
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={labels.selectQuality}
        className={styles.trigger}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
      >
        <span className={styles.triggerText}>
          {selectedOption ? (
            <>
              <span className={styles.triggerLabel}>{selectedOption.label}</span>
              {selectedOption.id === defaultVideoId || selectedOption.id === defaultAudioId ? (
                <span className={styles.defaultBadge}>{labels.default}</span>
              ) : null}
            </>
          ) : (
            <span className={styles.placeholder}>{labels.selectQuality}</span>
          )}
        </span>
        <ChevronDown
          size={18}
          className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}
        />
      </button>

      {/* Dropdown list */}
      {isOpen && (
        <ul
          ref={listRef}
          role="listbox"
          className={styles.list}
          style={{ opacity: 0 }}
        >
          {availableOptions.map((option, index) => {
            const isSelected = option.id === currentSelectedId;
            const isHighlighted = index === highlightedIndex;
            return (
              <li
                key={option.id}
                role="option"
                aria-selected={isSelected}
                className={`${styles.option} ${isSelected ? styles.optionSelected : ''} ${isHighlighted ? styles.optionHighlighted : ''}`}
                onClick={() => handleSelect(option.id)}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                <span className={styles.optionMain}>
                  <span className={styles.optionLabel}>{option.label}</span>
                  {option.sublabel && (
                    <span className={styles.optionSublabel}>{option.sublabel}</span>
                  )}
                </span>
                {isSelected && <Check size={16} className={styles.checkIcon} />}
                {(option.id === defaultVideoId || option.id === defaultAudioId) && (
                  <span className={styles.optionDefault}>{labels.default}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
