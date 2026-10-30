# DoughLab

**Oyun hamuruyla veri geometrisi.** Tarayıcıda sanal oyun hamurundan 3B şekiller yap, sonra bu şekillerden bir nokta bulutu, yani gerçek bir veri seti üret.

> *English:* A browser-based, play-dough-style 3D sandbox for learning data geometry. Sculpt shapes and turn them into point-cloud datasets, or load a CSV, reduce it to 3D with PCA and sculpt a model over it. Live PCA, correlation and fit scores included. No install required.

**Canlı demo:** `https://<kullanıcı-adın>.github.io/<depo-adı>/` (GitHub Pages açıldıktan sonra bu bağlantıyı güncelle)

Proje, "Veri Bilimine Giriş" dersindeki bir ödevden doğdu: Gapminder verisinin 3B PCA grafiğini evde oyun hamuruyla modellemek. PCA grafiğinde şu yapılar görülüyordu:

- masa üstü gibi düz bir ana kütle,
- ondan ayrı duran doğrusal bir dizi,
- kıvrımlı alt örüntüler,
- köşede ayrık bir küme.

DoughLab bu fikri iki yönlü hale getiriyor. Veriyi hamurla modelleyebilirsin; aynı zamanda hamurdan veri de üretebilirsin.

## Çalıştırma

Kurulum gerekmez, statik bir sayfadır. ES modülleri kullandığı için dosyayı doğrudan açmak yerine bir yerel sunucu üzerinden aç:

```bash
python -m http.server 8000
```

Sonra tarayıcıda `http://localhost:8000` adresine git. Three.js CDN'den yüklendiği için internet bağlantısı gerekir.

### GitHub Pages ile yayınlama

1. Depoda **Settings → Pages** sayfasına git.
2. **Source:** *Deploy from a branch*, **Branch:** `main`, klasör: `/ (root)` seç ve kaydet.
3. Bir iki dakika sonra site `https://<kullanıcı-adın>.github.io/<depo-adı>/` adresinde yayında olur.

## Özellikler

- **Üç parça türü:** top, yılan (bükülebilir) ve levha (bükülebilir).
- **Taşı / döndür / ölçekle** araçları. Kısayollar: `W` `E` `R`.
- **Renk, hamur türü ve doku ayarları.**
- **Nokta bulutu üretimi:** Her parçanın içinden, hacmiyle orantılı sayıda gözlem örneklenir.
- **Üç görünüm:** sadece hamur, hamur + noktalar (yarı saydam) ve sadece noktalar.
- **CSV indirme:** `x, y, z, group, piece, shape, dough` sütunlarıyla. Dosyayı doğrudan Colab'a yükleyip analiz edebilirsin.
- **Canlı analiz paneli:** Hamuru şekillendirdikçe güncellenir.
  - PCA: açıklanan varyans oranları, bileşen yükleri ve şekil yorumu (çizgisel / düzlemsel / hacimsel).
  - PCA eksenleri sahnede ok olarak gösterilir (merkezden ±2 standart sapma).
  - x, y, z eksen çiftleri için Pearson, Spearman ve Kendall korelasyonları, gri tonlu ısı haritası olarak.
  - Grup etkisi (η²): Grup etiketi her eksendeki varyansın ne kadarını açıklıyor.
  - Analiz tüm parçalar ya da yalnızca seçili parça için yapılabilir. İkisini karşılaştırmak, bütünün ve alt grubun farklı örüntüler gösterebileceğini (Simpson paradoksu) görmenin kolay bir yolu.
- **Hayalet veri modu:** Kendi CSV'ni yükle ya da tek tıkla Gapminder örneğini getir.
  - Seçtiğin sayısal sütunlar PCA ile 3B'ye indirgenir ve sahnede yarı saydam bir nokta bulutu olarak görünür. PC1 → x, PC2 → z (zemin), PC3 → y (yukarı).
  - Standartlaştırma (z-skoru) ve çarpık pozitif sütunlara log dönüşümü açılıp kapatılabilir. Bu tercihlerin PCA sonucunu ne kadar değiştirdiğini anında görürsün. Gapminder'da: standartlaştırılmış %90.9 (46.3 + 25.5 + 19.0), standartlaştırmasız %100 (tamamı PC1'de, çünkü nüfus her şeyi bastırır), log ile %96.1.
  - Noktalar kategorik bir sütuna göre renklenir (ör. kıta). Her değişken için bir yük oku (biplot) çizilir.
  - Bir noktanın üzerine gelince o satırın değerleri görünür.
  - **Hamur uyumu:** *Kapsama* verinin ne kadarına hamur değdiğini, *Taşma* hamurun ne kadarının verinin olmadığı yerde kaldığını gösterir.
  - Virgül, noktalı virgül (ondalık virgüllü Türkçe Excel çıktıları dahil) ve sekme ayraçlı CSV'ler okunur. En fazla 20.000 satır kullanılır.
- **Sahneyi JSON olarak kaydetme ve açma:** Modellerini başkalarıyla paylaşabilirsin.
- **Örnek sahne:** Derste Gapminder PCA grafiğinden okunan yapıların hamur karşılığı.

## Hamur ↔ veri karşılıkları

| Hamur | Veri |
|---|---|
| Renk / grup adı | Kategorik değişken (ör. kıta) |
| Büyüklük (hacim) | Gözlem sayısı *n* |
| Doku | Gürültü: noktaların yüzeyden saçılması |
| Bükülme | Doğrusal olmayan (eğrisel) ilişki |
| Ayrı parçalar | Alt gruplar / kümeler |
| Hamur türü | Yalnızca görünüm, veriyi etkilemez |

## Colab'da hızlı başlangıç

```python
import pandas as pd
from sklearn.decomposition import PCA

df = pd.read_csv("doughlab-data.csv")
pca = PCA(n_components=3).fit(df[["x", "y", "z"]])
print(pca.explained_variance_ratio_)
```

## Yol haritası

- [x] Uygulama içinde canlı PCA, açıklanan varyans ve korelasyon (Pearson / Spearman / Kendall) paneli
- [x] CSV yükleyip PCA nokta bulutunu "hayalet" olarak gösterme ve üzerine hamurla model kurma
- [ ] Gölge modu: ışığı döndürüp 2B projeksiyonu gerçek PCA projeksiyonuyla karşılaştırma
- [ ] Regresyon düzlemi ve residual grafiği

## Teknik

[Three.js](https://threejs.org) (CDN üzerinden). Derleme adımı yoktur.

```
index.html        arayüz
style.css         stiller
src/main.js       sahne, parçalar, arayüz, dışa aktarma
src/geometry.js   hamur geometrileri, bükme ve yüzey dokusu
src/sampling.js   parça içinden nokta örnekleme
src/analysis.js   PCA, Pearson, Spearman, Kendall, η²
src/ghost-data.js CSV okuma, hayalet PCA'sı, hamur uyum skoru (Three.js'siz)
src/ghost.js      hayalet nokta bulutu ve değişken okları
src/arrows.js     etiketli 3B oklar
```

## Katkı

Hata bildirimleri ve öneriler için bir *issue* açabilir, değişiklikler için *pull request* gönderebilirsin.

## Veri ve teşekkür

Gapminder örneği, [plotly/datasets](https://github.com/plotly/datasets) deposundaki `gapminderDataFiveYear.csv` dosyasından çalışma anında indirilir. Veri [Gapminder](https://www.gapminder.org) kaynaklıdır.

## Lisans

[MIT](LICENSE)
