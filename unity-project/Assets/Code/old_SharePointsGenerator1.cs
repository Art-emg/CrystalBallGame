using UnityEngine;
using System.Collections.Generic;
using System.IO;

// Класс для создания точек на сфере на основе изображения
public class SpherePuzzle_old : MonoBehaviour
{
    [Header("References")] 
    public Camera mainCamera; // Основная камера для проекции
    public GameObject pointPrefab; // Префаб точки, которая будет создаваться
    public Transform sphereTransform; // Трансформ сферы, на которой будут размещаться точки

    [Header("Settings")] 
    public string imagePath = "Assets/Figures/star.png"; // Путь к изображению-шаблону
    [Range(1, 50)] public int stepSize = 10; // Шаг между точками при сканировании изображения
    public float sphereRadius = 1f; // Радиус сферы
    [Range(0.1f, 1.0f)] public float imageScale = 0.8f; // Масштаб проекции изображения

    [Header("Point Generation")] 
    [Range(0.1f, 0.4f)]
    public float minDepth = 0.3f; // Минимальная глубина размещения точек

    [Range(0.6f, 0.9f)] public float maxDepth = 0.7f; // Максимальная глубина размещения точек

    private List<Vector3> _points = new(); // Список позиций точек
    private Texture2D _shapeImage; // Загруженное изображение-шаблон

    // Инициализация при старте
    private void Start()
    {
        LoadAndGeneratePoints();
    }

    // Загрузка изображения и генерация точек
    private void LoadAndGeneratePoints()
    {
        _shapeImage = LoadImage(imagePath);
        if (_shapeImage == null) return;

        ClearExistingPoints();
        GeneratePoints();
    }

    // Очистка существующих точек
    private void ClearExistingPoints()
    {
        _points.Clear();
        var existingPoints = GetComponentsInChildren<Transform>();
        foreach (var point in existingPoints)
        {
            if (point != transform && point != sphereTransform)
            {
                Destroy(point.gameObject);
            }
        }
    }

    // Основной метод генерации точек
    private void GeneratePoints()
    {
        var distanceToSphere = (mainCamera.transform.position - sphereTransform.position).magnitude;

        var projectionSize = sphereRadius * imageScale;

        // Центр проекции перед сферой
        var projectionCenter = sphereTransform.position + mainCamera.transform.forward * (sphereRadius * 0.5f);

        var width = _shapeImage.width;
        var height = _shapeImage.height;

        var aspectRatio = (float)height / width;
        var worldWidth = projectionSize;
        var worldHeight = projectionSize * aspectRatio;

        // Перебор пикселей изображения
        for (var x = 0; x < width; x += stepSize)
        {
            for (var y = 0; y < height; y += stepSize)
            {
                var pixel = _shapeImage.GetPixel(x, y);
                if (pixel.grayscale < 0.5f) // Если пиксель темный
                {
                    // Нормализуем координаты в диапазон [-0.5, 0.5] и умножаем на размер проекции
                    var normalizedX = ((float)x / width - 0.5f) * worldWidth;
                    var normalizedY = ((float)y / height - 0.5f) * worldHeight;

                    var projectionPoint = projectionCenter +
                                          mainCamera.transform.right * normalizedX +
                                          mainCamera.transform.up * normalizedY;

                    var rayDirection = (projectionPoint - mainCamera.transform.position).normalized;

                    // Проверяем пересечение луча со сферой
                    if (SphereRayIntersection(mainCamera.transform.position, rayDirection,
                            sphereTransform.position, sphereRadius, out var entry, out var exit))
                    {
                        // Генерируем точку на случайной глубине между точками входа и выхода
                        var randomDepth = Random.Range(minDepth, maxDepth);
                        var pointPosition = Vector3.Lerp(entry, exit, randomDepth);

                        // Проверка расстояния до центра сферы
                        var distanceToCenter = Vector3.Distance(pointPosition, sphereTransform.position);
                        if (distanceToCenter <= sphereRadius * 0.99f)
                        {
                            _points.Add(pointPosition);
                        }
                    }
                }
            }
        }

        SpawnPoints();
    }

    // Проверка пересечения луча со сферой
    private bool SphereRayIntersection(Vector3 rayOrigin, Vector3 rayDirection, Vector3 sphereCenter,
        float sphereRadius, out Vector3 entry, out Vector3 exit)
    {
        entry = exit = Vector3.zero;

        var l = sphereCenter - rayOrigin;
        var tca = Vector3.Dot(l, rayDirection);

        if (tca < 0) return false; // Луч направлен от сферы

        var d2 = Vector3.Dot(l, l) - tca * tca;
        var radiusSquared = sphereRadius * sphereRadius;

        if (d2 > radiusSquared) return false; // Луч не пересекает сферу

        var thc = Mathf.Sqrt(radiusSquared - d2);
        var t0 = tca - thc;
        var t1 = tca + thc;

        if (t0 < 0 && t1 < 0) return false; // Точки пересечения позади луча

        entry = rayOrigin + rayDirection * Mathf.Max(0, t0);
        exit = rayOrigin + rayDirection * t1;

        return true;
    }

    // Создание точек в сцене
    private void SpawnPoints()
    {
        foreach (var point in _points)
        {
            var pointObj = Instantiate(pointPrefab, point, Quaternion.identity, sphereTransform);
            pointObj.transform.localScale = Vector3.one * Random.Range(0.005f, 0.02f); // Случайный размер точки
            // Финальная проверка положения точки
            if (Vector3.Distance(point, sphereTransform.position) > sphereRadius)
            {
                Destroy(pointObj);
            }
        }
    }

    // Загрузка изображения из файла
    private Texture2D LoadImage(string path)
    {
        if (!File.Exists(path))
        {
            Debug.LogError($"Image file not found: {path}");
            return null;
        }

        var fileData = File.ReadAllBytes(path);
        var tex = new Texture2D(2, 2);
        tex.LoadImage(fileData);
        return tex;
    }
}