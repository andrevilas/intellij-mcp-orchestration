import type { ReactElement } from 'react';

export type MediaSource =
  | {
      type: 'video';
      src: string;
      title: string;
      poster?: string;
    }
  | {
      type: 'iframe';
      src: string;
      title: string;
      allow?: string;
      allowFullScreen?: boolean;
    }
  | {
      type: 'image';
      src: string;
      title: string;
    };

export interface MediaPlayerProps {
  source: MediaSource;
  autoPlay?: boolean;
}

export default function MediaPlayer({ source, autoPlay = false }: MediaPlayerProps): ReactElement {
  if (source.type === 'video') {
    return (
      <div className="media-player">
        <video
          className="media-player__element"
          controls
          playsInline
          autoPlay={autoPlay}
          poster={source.poster}
          aria-label={source.title}
        >
          <source src={source.src} type="video/mp4" />
        </video>
      </div>
    );
  }

  if (source.type === 'iframe') {
    return (
      <div className="media-player">
        <iframe
          className="media-player__element media-player__element--iframe"
          src={source.src}
          title={source.title}
          allow={
            source.allow ??
            'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'
          }
          allowFullScreen={source.allowFullScreen ?? true}
        />
      </div>
    );
  }

  return (
    <div className="media-player">
      <img className="media-player__element" src={source.src} alt={source.title} />
    </div>
  );
}
