-- Create contentrequest table in production
CREATE TABLE IF NOT EXISTS `contentrequest` (
  `id` int NOT NULL AUTO_INCREMENT,
  `trendIssue` varchar(45) DEFAULT NULL,
  `snsEvent` varchar(45) DEFAULT NULL,
  `essentialKeyword` varchar(45) DEFAULT NULL,
  `competitor` varchar(250) DEFAULT NULL,
  `uploadCycle` varchar(5) DEFAULT NULL,
  `toneMannerList` varchar(60) DEFAULT NULL,
  `imageVideoRatio` tinyint DEFAULT NULL,
  `imageRatio` varchar(5) DEFAULT NULL,
  `directionList` varchar(500) DEFAULT NULL,
  `mainColor` varchar(100) DEFAULT NULL,
  `searchResult` varchar(800) DEFAULT NULL,
  `searchToken` smallint DEFAULT NULL,
  `subjectToken` smallint DEFAULT NULL,
  `createdAt` datetime DEFAULT NULL,
  `fk_projectId` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `contentRequest_project_idx` (`fk_projectId`),
  CONSTRAINT `contentRequest_project` FOREIGN KEY (`fk_projectId`) REFERENCES `project` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;