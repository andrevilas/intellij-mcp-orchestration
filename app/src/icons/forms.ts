import { config, library } from '@fortawesome/fontawesome-svg-core';
import { faGlobe } from '@fortawesome/free-solid-svg-icons/faGlobe';
import { faLock } from '@fortawesome/free-solid-svg-icons/faLock';
import { faCloudArrowUp } from '@fortawesome/free-solid-svg-icons/faCloudArrowUp';
import { faCloudArrowDown } from '@fortawesome/free-solid-svg-icons/faCloudArrowDown';

config.autoAddCss = false;

library.add(faGlobe, faLock, faCloudArrowUp, faCloudArrowDown);
