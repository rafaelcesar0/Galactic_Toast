from random import randint
from sys import exit
import pygame
from pygame import display, font
from pygame.image import load
from pygame.transform import scale
from pygame.sprite import Sprite, Group, GroupSingle, groupcollide
from pygame.locals import *

pygame.init()

display.set_caption('Galáctica toast')

WIDTH = 800
HEIGHT = 600

FONTE = font.SysFont('Comicsans', 20)

pygame.mixer.music.set_volume(0.8)
MUSIC = pygame.mixer.music.load(r'assets\sounds\background_music.mp3')

BARUNHO_ACERTO = pygame.mixer.Sound(r'assets\sounds\point.wav')

BARUNHO_GAME_OVER = pygame.mixer.Sound(r'assets\sounds\game_over.wav')

BARULHO_TIRO = pygame.mixer.Sound(r'assets\sounds\tiro.wav')

WINDOW = display.set_mode(
    size=(WIDTH, HEIGHT),
    display=0
)

BACKGROUND =  scale(
    load(r'assets\img\space.jpg'),
    (WIDTH, HEIGHT)
)

class Dunofausto(Sprite):
    def __init__(self, torradas):
        super().__init__()
        
        self.image = load(r'assets\img\torradeira.png')
        self.rect = self.image.get_rect()
        self.torradas = torradas
        self.velocidade = 8
        
    def tacar_torrada(self):
        BARULHO_TIRO.play()
        if len(self.torradas) < num_tiros:
            self.torradas.add(Torradas(*self.rect.center))
        
    def update(self):
        keys = pygame.key.get_pressed()
        
        fonte_torradas = FONTE.render(
            f'Torradas: {num_tiros -len(self.torradas)}',
            True,
            (255, 255, 255)
        )
        
        WINDOW.blit(fonte_torradas, (1,1))
        
        if keys[pygame.K_UP] and self.rect.y > 0:
            self.rect.y -= self.velocidade
        if keys[pygame.K_DOWN] and self.rect.y < HEIGHT-self.rect.width:
            self.rect.y += self.velocidade

class Torradas(Sprite):
    def __init__(self, x ,y):
        super().__init__()
        
        self.image = load(r'assets\img\toast_small.png')
        self.rect = self.image.get_rect(center=(x,y))

    def update(self):
        self.rect.x += 12
        
        if self.rect.x > WIDTH:
            self.kill()

class Virus(Sprite):
    def __init__(self):
        super().__init__()
        
        self.image = load(r'assets\img\Asteroid.png')
        self.rect = self.image.get_rect(center=(WIDTH, randint(20, HEIGHT-self.image.get_height())))
        
    def update(self):
        global perdeu
        if self.rect.x > 0:
            self.rect.x -= 4 
        elif self.rect.x <= 0:
            self.kill()
            perdeu = True



while True:
    grupo_inimigos = Group()
    grupo_torradas = Group()
    dunofausto = Dunofausto(grupo_torradas)
    grupo_duno = GroupSingle(dunofausto)

    grupo_inimigos.add(Virus())

    fps = pygame.time.Clock()
    
    num_tiros = 2
    mortes = 0
    rounde = 0
    perdeu = False
    pygame.mixer.music.play(-1)
    while True:
        fps.tick(60)
        
        if rounde % 100 == 0:
            if mortes < 20:
                grupo_inimigos.add(Virus())
            for _ in range(mortes // 10):
                grupo_inimigos.add(Virus())
                
                
        # Espaço de eventos:
        for event in pygame.event.get():
            if event.type == QUIT:
                pygame.quit()
                exit()
            if event.type == KEYUP:
                if event.key == K_SPACE:
                    dunofausto.tacar_torrada()
        
        if groupcollide(grupo_torradas, grupo_inimigos, True, True):
            BARUNHO_ACERTO.play()
            mortes += 1
            if mortes % 20 == 0:
                num_tiros += 1
        # Espaço de display: 
        WINDOW.blit(BACKGROUND, (0,0))
        
        fonte_mortes = FONTE.render(
                f'Mortes: {mortes}',
                True,
                (255, 255, 255)
            )
        WINDOW.blit(fonte_mortes, (1, 22))
        grupo_duno.draw(WINDOW)
        grupo_inimigos.draw(WINDOW)
        grupo_torradas.draw(WINDOW)
        
        grupo_duno.update()
        grupo_inimigos.update()
        grupo_torradas.update()
        
        
        if perdeu or groupcollide(grupo_duno, grupo_inimigos, False, False):
            pygame.mixer.music.pause()
            BARUNHO_GAME_OVER.play()
            FONTE_PERDEU = font.SysFont('comicsans', 80)
            game_over = FONTE_PERDEU.render('Game Over', True, (255, 255, 255))
            game_over_rect = game_over.get_rect(center=(WIDTH/2, HEIGHT/2))
            WINDOW.blit(game_over, (200, 200))
        
        display.flip()
        rounde += 1
        if perdeu or groupcollide(grupo_duno, grupo_inimigos, False, False):
            break
    
    del grupo_duno
    del dunofausto
    del grupo_torradas
    del grupo_inimigos
    
    ficar = True
    while ficar:
        fps.tick(60)
        
        for event in pygame.event.get():
            if event.type == QUIT:
                pygame.quit()
                exit()
            if event.type == KEYUP:
                if event.key == K_RETURN:
                    ficar = not ficar
        display.flip()