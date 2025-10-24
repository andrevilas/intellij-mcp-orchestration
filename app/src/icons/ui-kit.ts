import { config, library } from '@fortawesome/fontawesome-svg-core';
import { faDownload } from '@fortawesome/free-solid-svg-icons/faDownload';
import { faShareNodes } from '@fortawesome/free-solid-svg-icons/faShareNodes';
import { faPenToSquare } from '@fortawesome/free-solid-svg-icons/faPenToSquare';
import { faPlay } from '@fortawesome/free-solid-svg-icons/faPlay';
import { faRotateRight } from '@fortawesome/free-solid-svg-icons/faRotateRight';
import { faCircleStop } from '@fortawesome/free-solid-svg-icons/faCircleStop';
import { faRocket } from '@fortawesome/free-solid-svg-icons/faRocket';
import { faRotateLeft } from '@fortawesome/free-solid-svg-icons/faRotateLeft';
import { faBoxArchive } from '@fortawesome/free-solid-svg-icons/faBoxArchive';

config.autoAddCss = false;

library.add(
  faDownload,
  faShareNodes,
  faPenToSquare,
  faPlay,
  faRotateRight,
  faCircleStop,
  faRocket,
  faRotateLeft,
  faBoxArchive,
);
