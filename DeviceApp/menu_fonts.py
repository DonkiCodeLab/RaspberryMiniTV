"""pygame-compatible fonts with shaping and font fallback for multilingual text.

Pango handles bidirectional Arabic/Urdu, Indic shaping and CJK fallback on the
Raspberry. Pillow/RAQM provides the desktop-preview path on macOS.
"""
from functools import lru_cache
from io import BytesIO
from pathlib import Path
import sys
import pygame

try:
    import gi
    gi.require_version('Pango', '1.0')
    gi.require_version('PangoCairo', '1.0')
    import cairo
    from gi.repository import Pango, PangoCairo
except (ImportError, ValueError):
    Pango = None


class MenuFont:
    def __init__(self, size, bold=False, path=None):
        self.pixels = size
        self.bold = bold
        self.path = path
        self.fallback = pygame.font.Font(path, size) if path else pygame.font.SysFont('DejaVu Sans', size, bold=bold)

    def __getattr__(self, name):
        return getattr(self.fallback, name)

    @staticmethod
    def needs_shaping(text):
        return any(ord(char) > 0x024f for char in text)

    @lru_cache(maxsize=160)
    def _shaped(self, text, color):
        if Pango is not None:
            surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, 1, 1)
            context = cairo.Context(surface)
            layout = PangoCairo.create_layout(context)
            font = Pango.FontDescription('Noto Sans')
            font.set_absolute_size(self.pixels * Pango.SCALE)
            if self.bold:
                font.set_weight(Pango.Weight.BOLD)
            layout.set_font_description(font)
            layout.set_auto_dir(True)
            layout.set_text(text, -1)
            ink, logical = layout.get_pixel_extents()
            left, top = min(0, ink.x), min(0, ink.y)
            width = max(1, logical.width, ink.x + ink.width) - left
            height = max(1, logical.height, ink.y + ink.height) - top
            surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, width, height)
            context = cairo.Context(surface)
            context.set_source_rgba(*(component / 255 for component in color))
            context.move_to(-left, -top)
            PangoCairo.show_layout(context, layout)
            stream = BytesIO()
            surface.write_to_png(stream)
            stream.seek(0)
            return pygame.image.load(stream)
        if sys.platform == 'darwin':
            from PIL import Image, ImageDraw, ImageFont
            font_path = '/System/Library/Fonts/Supplemental/Arial Unicode.ttf'
            if not Path(font_path).exists():
                font_path = '/Library/Fonts/Arial Unicode.ttf'
            if Path(font_path).exists():
                font = ImageFont.truetype(font_path, self.pixels)
                left, top, right, bottom = font.getbbox(text)
                image = Image.new('RGBA', (max(1, right - left), max(self.pixels, bottom - top)), (0, 0, 0, 0))
                ImageDraw.Draw(image).text((-left, -top), text, font=font, fill=color)
                return pygame.image.frombuffer(image.tobytes(), image.size, 'RGBA').copy()
        return self.fallback.render(text, True, color)

    def render(self, text, antialias, color, background=None):
        text = str(text)
        if not self.needs_shaping(text):
            return self.fallback.render(text, antialias, color, background)
        rgba = tuple(pygame.Color(color))
        surface = self._shaped(text, rgba).copy()
        if background is not None:
            base = pygame.Surface(surface.get_size(), pygame.SRCALPHA)
            base.fill(background)
            base.blit(surface, (0, 0))
            return base
        return surface

    def size(self, text):
        if not self.needs_shaping(text):
            return self.fallback.size(text)
        return self._shaped(str(text), (255, 255, 255, 255)).get_size()
