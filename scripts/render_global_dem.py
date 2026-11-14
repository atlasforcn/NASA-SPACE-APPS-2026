"""Render the actual 16 ppd numeric DEM as an offline relief overview."""
from pathlib import Path
import numpy as np
from PIL import Image
root=Path(__file__).resolve().parents[1]
z=np.fromfile(root/'data/mola16.bin',dtype='<i2').reshape(2880,5760).astype('float32')
# PDS columns start at 0E; the Leaflet world image starts at -180 (=180E).
z=np.roll(z,2880,axis=1)
levels=[-8200,-4000,0,5000,12000,22000]
palette=np.array([[24,42,86],[52,100,150],[111,149,137],[191,158,101],[198,111,76],[239,228,204]],dtype='float32')
lat=(90-(np.arange(2880)+.5)/16)*np.pi/180
gy,gx=np.gradient(z)
gx/=3705*np.maximum(.01,np.cos(lat))[:,None]
gy/=3705
shade=(.8+.2*(-gx-gy+1)/np.sqrt(gx*gx+gy*gy+1)).clip(.45,1.15)
rgb=np.stack([np.interp(z,levels,palette[:,channel])*shade for channel in range(3)],axis=2).clip(0,255).astype('uint8')
Image.fromarray(rgb).save(root/'data/mars-global-dem.jpg',quality=90)
print('Numeric MOLA relief rendered at native 16 ppd')
